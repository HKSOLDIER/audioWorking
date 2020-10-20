import React, { useState, Component } from "react";
import {
  Dimensions,
  Platform,
  StyleSheet,
  TouchableOpacity,
  Text,
  View,
  TextInput,
  ScrollView,
  Image,
  Switch,
  Button,
} from "react-native";
import { Skylink } from "./skylink_rn.complete.js";
//import for google Maps 


//import Geolocation from '@react-native-community/geolocation';

import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import appConfig from './app-config.js';

const config = {
  appKey: appConfig.appKey,
  credentials: appConfig.credentials,
  defaultRoom: appConfig.defaultRoom,
  forceSSL: true,
};

const skylink = new Skylink(config);
console.log("INIT REACT NATIVE APP");
window.skylink = skylink;
const dimensions = Dimensions.get("window");

const instructions = Platform.select({
  ios: "Press Cmd+R to reload,\n" + "Cmd+D or shake for dev menu",
  android:
    "Double tap R on your keyboard to reload,\n" +
    "Shake or press menu button for dev menu"
});

const skylinkEventManager = Skylink.SkylinkEventManager;
const events = Skylink.SkylinkConstants.EVENTS;

export default class App extends Component {
  constructor(props) {
    super(props);
    this.success = "";
    this.state = {
      localStreamURL: null,
      peeridd:"Not yet registered",
      streamList: [],
      screenStreamList: [],
      localStreamList:[],
      p2pMessage: false,
      text: "",
      peerList: [],
      isRoomJoined: false,
      hasError: false,
      media: {
        audio: false
      },
      mediaState: {
        audioMuted: true
      },
      isLoading: {
        switchCamera: false,
        sendStream: false,
      },
      //maps
     
        
    };
  }

  componentDidCatch(error, info) {
    this.setState({ hasError: true });
  }

  componentDidMount() {
    const self = this;
    
    
    try {
      
      this.joinRoom();
      
      skylinkEventManager.addEventListener(events.DATA_CHANNEL_STATE, response => {
        this.logToConsole('DATA_CHANNEL_STATE', response, true);
      });

      skylinkEventManager.addEventListener(
          events.MEDIA_ACCESS_SUCCESS,
          response => {
            this.logToConsole('MEDIA_ACCESS_SUCCESS', response, true);
            const url = response.detail.stream.toURL();
            const tempStream = [];
            tempStream.push({ localStream: url, audio: response.detail.stream._tracks[0].kind === "audio"});
            this.setState({localStreamList : tempStream});
            self.setState({
              localStreamURL: url
            });
          }
      );

      skylinkEventManager.addEventListener(events.ON_INCOMING_STREAM, response => {
        this.logToConsole('ON_INCOMING_STREAM', response, true);

        if (response.detail.isSelf) {
          const media = this.state.media;
          const mediaState = this.state.mediaState;

          if (response.detail.isAudio) {
            media.audio = true;
            mediaState.audioMuted = false;
          }

          if (this.state.isLoading.sendStream) {
            this.state.isLoading.sendStream = false;
            this.setState({isLoading: this.state.isLoading})
          }

          self.setState( { media: media });
          self.setState( { mediaState: mediaState });
          return;
        }


        const url = response.detail.stream.toURL();
        self.addUrl(url, response.detail);
      });

      skylinkEventManager.addEventListener(events.ON_INCOMING_SCREEN_STREAM, response => {
        this.logToConsole('ON_INCOMING_SCREEN_STREAM', response, true);

        if (response.detail.isSelf) {
          return;
        }
        const url = response.detail.stream.toURL();
        const isScreen = true;
        self.addUrl(url, response.detail, isScreen);
      });

      skylinkEventManager.addEventListener(events.PEER_LEFT, response => {
        this.logToConsole('PEER_LEFT', response, true);
        const { peerId, isSelf } = response.detail;
        if (isSelf) {
          if (self.state.localStreamURL) {
            let updatedStreamlist = self.state.streamList
            .map(item => {
              return item.peerID;
            })
            .indexOf(response.detail.peerId);
            self.state.streamList.splice(updatedStreamlist, 2);
            if (self.state.streamList.length === 0) {
              self.state.screenStreamList = [];
            }
            self.setState({streamList: self.state.streamList});
            self.setState({screenStreamList: self.state.screenStreamList});
          }
        } else if (self.state.streamList.length !== 0) {
          const streamList = this.state.streamList.map((stream, i) => {
            if (stream.peerID !== peerId) {
              return this.state.streamList[i];
            }
          }).filter((peer) => peer !== undefined);
          this.setState({streamList: streamList});
        }

        if (!isSelf) {
          const updatedPeerList = this.state.peerList;
          updatedPeerList.forEach((peer, i) => {
            if (peer.peerId === peerId) {
              delete updatedPeerList[i];
            }
          });
          this.setState({peerList: updatedPeerList});
        }
      });

      skylinkEventManager.addEventListener(events.PEER_JOINED, response => {
        this.logToConsole('PEER_JOINED', response, true);
        const { isSelf, peerId, peerInfo } = response.detail;
        this.setState({ peeridd: peerId})
        const updatedPeerList = this.state.peerList;
        if (!isSelf) {
          updatedPeerList.push({
              isSelected: false,
              peerId,
              peerInfo,
              color: this.getRandomColor(),
            });
        }
        self.setState({ peerList: updatedPeerList });
      });

      skylinkEventManager.addEventListener(events.STREAM_ENDED, response => {
        this.logToConsole('STREAM_ENDED', response, true);
        self.removeUrl(response.detail.streamId, response.detail.isScreensharing);
        this.setState({ peeridd:response.detail.streamId})
      });

      skylinkEventManager.addEventListener(events.PEER_UPDATED, response => {
        this.logToConsole('PEER_UPDATED', response, true);
      });

      //User in the room (including us) sent a message
      skylinkEventManager.addEventListener(events.ON_INCOMING_MESSAGE, response => {
        const Name =
          response.detail.peerInfo.userData +
          (response.detail.isSelf ? " (You)" : "");
        self.addMessage(Name, response.detail.message);
      });
      
    } catch (error) {
      console.log(error);
      this.setState({ hasError: true });
    }
  }

  addMessage(Name, message) {
    this.state.messageList.push(
      <Text>
        {message.content.trim() + " "}
        <Text style={styles.username}>{Name} [{message.isPrivate ? "Private" : "Public"}][{message.isDataChannel ? "P2P" : "Socket"}][{message.timeStamp || new Date().toISOString()}]</Text>
      </Text>
    );
    this.setState({ messageList: this.state.messageList });
  }

  removeUrl(streamId, isScreensharing) {
    if (isScreensharing) {
      const screenStreamList = this.state.screenStreamList;
      screenStreamList.forEach((stream, i) => {
        if (stream.id === streamId) {
          screenStreamList.splice(i, 1);
        }
      });
      this.setState({ screenStreamList: screenStreamList });
    } else {
      const streamList = this.state.streamList;
      streamList.forEach((stream, i) => {
        if (stream.id === streamId) {
          streamList.splice(i, 1);
        }
      });
      this.setState({ streamList: streamList });
    }
  }

  addUrl(newStream, data, isScreensharing) {
    if (isScreensharing) {
      const screenStreamList = this.state.screenStreamList;
      screenStreamList.unshift({
        streamUrl: newStream,
        id: data.streamId,
        peerID: data.peerId,
        audio: data.isAudio,
      });
      this.setState({ screenStreamList: screenStreamList });
    } else {
      const streamList = this.state.streamList;
      streamList.unshift({
        streamUrl: newStream,
        id: data.streamId,
        peerID: data.peerId,
        audio: data.isAudio,
      });
      console.log(streamList);
      this.setState({ streamList: streamList });
    }
  }

  render() {
    return (
      <View style={{ flex: 1 }}>
        {!this.state.hasError && (
          <View style={styles.container}>
            <View style={styles.navBar}>
             
             
              <View style={styles.rightNav}>
                <TouchableOpacity
                  onPress={
                    this.state.isRoomJoined ? this.leaveRoom : this.joinRoom
                    
                  }
                >
                  <Icon
                    style={styles.navItem}
                    name={this.state.isRoomJoined ? "account-off" : "account"}
                    size={22}
                    color={"white"}
                  />
                </TouchableOpacity>
              </View>
            {/* <Text style={{marginBottom: 20, fontSize: 15}}> {this.state.peeridd} </Text> */}
            </View>

            {this.state.isVideoChat && (
              <View style={styles.videoWidgetLocal}>
                {this.state.localStreamURL && !this.state.isChatOpen && (
                      this.state.localStreamList.map((stream, index) => {
                       return (
                           <window.RTCView
                          streamURL={stream.localStream}
                          style={stream.audio === true
                              ? styles.hide : styles.rtcViewLocal}
                          key={index*11}
                          />
                        )
                        })
                )}
               
              </View>
            )}
             <View style={{flex:0.8}}>
             
                 </View>
                 <View style={{flex:0.2,alignContent:'center',alignItems:'center',justifyContent:'center'}}>
                     <Button  title="make a call"
                     
                    //onPress={()=>this.props.navigation.navigate('Group')}
                    ></Button>
                 </View>

          {/* CHAT WINDOW SCREEN */}
          </View>
        )}
        {this.state.hasError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorMessage}>
              Something is wrong please restart the application and try again.
              :)
            </Text>
          </View>
        )}

        
      </View>
    );
  }

  getRandomColor = () => {
    var letters = '0123456789ABCDEF';
    var color = '#';
    for (var i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  };

  selectPeer = (peerId) => {
    console.log(peerId);
    const updatedPeerList = this.state.peerList;
    this.state.peerList.forEach((peer, i) => {
      if (peer.peerId === peerId) {
        updatedPeerList[i].isSelected = !this.state.peerList[i].isSelected;
      }
    });
    this.setState({peerList: updatedPeerList});
  };


  logToConsole = (log, data = '', event) => {
    console.log(`${event ? '[EVENT]' : '[METHOD]'} ${log} :`, data);
  };

  joinRoom = () => {
    let self = this;
    this.state.isVideoChat = false;
    self.success = config.defaultRoom;
    var displayName = "User_" + Math.floor(Math.random() * 1000 + 1);
    skylink
      .joinRoom({
        userData: displayName,
        audio: true
      })
      .then(res => {
        self.setState({ isRoomJoined: true });
      })
    .catch((err) => {
      console.log("JOIN ROOM FAILED: ", err);
    });
  };

  stopStreams = () => {
    this.logToConsole('stopStreams');
    this.setState({ localStreamURL: null });
    skylink.stopStreams(config.defaultRoom);
  };

  sendStream = () => {
    this.logToConsole('sendStream');
    this.state.isLoading.sendStream = true;
    this.setState({isLoading: this.state.isLoading});
    skylink.sendStream(config.defaultRoom, { audio: true });
  };

  muteAudio = () => {
    this.muteStreams("audio");
  };


  muteStreams = (type) => {
    this.logToConsole(`muteStreams ${type} `);
    const muteOptions = {
      audioMuted: this.state.mediaState.audioMuted
    };
    if (type === 'audio') {
      muteOptions.audioMuted = !this.state.mediaState.audioMuted;
    }
  
    skylink.muteStreams(config.defaultRoom, muteOptions);
    this.setState({ mediaState: muteOptions });
  };

  toggleMessageSwitch = () => {
    console.log(this.state.p2pMessage);
    const updatedP2pState = !this.state.p2pMessage;
    this.setState( {p2pMessage: updatedP2pState});
  };

  toggleView = () => {
    let self = this;
    

    let options = {
      audio: true
    };
/*
    setTimeout(()=> {
      window.getUserMedia(options)
      .then(stream => {
        this.logToConsole('sendStream', 'toggle facing camera');
        const self = this;
        skylink.sendStream(config.defaultRoom, stream).then(function(success) {
          const url = stream.toURL();
          self.setState({
            localStreamURL: url
          });
          if (stream === success) {
            self.logToConsole('sendStream', 'Same MediaStream has been sent');
          }
        })
        .catch((err) => {
          console.log(err);
        })
      });
    }, 2000);
   */
    skylink.stopStreams(config.defaultRoom);
  };

  leaveRoom = () => {
    this.state.isVideoChat = false;
    this.setState({ streamList: [] });
    this.setState({ localStreamURL: null });
    this.setState({ localStreamList: [] });
    this.setState({ isChatOpen: false });
    this.setState({ isRoomJoined: false });
    this.setState({ messageList: [] });
    this.setState({ peerList: [] });
    this.logToConsole('leaveRoom', this.state.localStreamList);

    skylink.leaveRoom(config.defaultRoom).then(result => {
      this.logToConsole('leaveRoom', `result: ${result}`);
    });
  };

 

  enterText = () => {
    if (!this.state.isRoomJoined) return;
    const selectedPeers = this.state.peerList.map((peer) => {
      if (peer.isSelected) {
        return peer.peerId;
      }
    }).filter((i) => i !== undefined);
    if (this.state.p2pMessage) {
      skylink.sendP2PMessage(config.defaultRoom, this.state.text, selectedPeers);
    } else {
      skylink.sendMessage(config.defaultRoom, this.state.text, selectedPeers);
    }
    this.setState({ text: "" });
  };
}

const styles = StyleSheet.create({
  hide: {
    display: "none"
  },
  container: {
    flex: 1,
    backgroundColor: "#F5FCFF"
  },
  instructions: {
    textAlign: "center",
    color: "#333333",
    marginBottom: 5
  },
  videoWidgetLocal: {
    position: "relative",
    flex: 1,
    width: "100%",
    flexDirection: "row",
    justifyContent: "flex-start"
  },
  rtcViewLocal: {
    flex: 1,
    width: dimensions.width,
    backgroundColor: "#ccc",
    position: "relative"
  },
  videoWidgetRemote: {
    position: "relative",
    flex: 1,
    width: "100%",
    flexDirection: "row",
  },
  rtcViewRemote: {
    flex: 1,
    width: dimensions.width,
    backgroundColor: "#ccc",
    position: "relative",
    flexDirection: "row",
  },
  chatWindow: {
    flex: 1,
    backgroundColor: "white"
  },
  chatTextView: {
    flexDirection: "column"
  },
  chatSettingsBox:{
    backgroundColor: "white",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  switch: {
    padding: 10,
  },
  chatTextArea: {
    flexDirection: "row",
    alignItems: "center",
    elevation: 1,
    paddingHorizontal: 10,
    justifyContent: "space-between",
    backgroundColor: "#EBF0F0",
    paddingTop: 5,
    paddingBottom: 5,
  },
  inputBox: {
    width: "90%",
    color: "#444"
  },
  messageNode: {
    maxWidth: "100%",
    color: "#444",
    textAlign: "left",
    fontSize: 15,
    paddingHorizontal: 15,
    paddingVertical: 5
  },
  joinNode: {
    maxWidth: "50%",
    color: "#444",
    fontSize: 15,
    margin: "auto",
    paddingHorizontal: 15,
    paddingVertical: 5
  },
  navBar: {
    height: 55,
    backgroundColor: "#444",
    elevation: 3,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  footerBar: {
    position: "absolute",
    bottom: 0,
    height: 55,
    width: "100%",
    backgroundColor: "#444",
    elevation: 3,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around"
  },
  rightNav: {
    flexDirection: "row"
  },
  navItem: {
    marginLeft: 25
  },
  disabled: {
    opacity: 0.5
  },
  bold: {
    fontWeight: "bold"
  },
  textCenter: {
    textAlign: "center"
  },
  smallTxt: {
    fontSize: 9
  },
  username: {
    fontSize: 10
  },
  errorContainer: {
    backgroundColor: "red",
    paddingHorizontal: 20,
    height: dimensions.height,
    alignItems: "center"
  },
  errorMessage: {
    color: "white",
    fontSize: 20,
    marginTop: 150,
    textAlign: "center"
  }
});