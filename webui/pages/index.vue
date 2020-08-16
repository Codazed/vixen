<template>
  <div>
    <v-container>
      <v-navigation-drawer app permanent hide-overlay>
        <template v-slot:prepend>
          <div v-if="authed">
            <v-list-item class="px-2">
              <v-list-item-avatar>
                    <v-img v-if="guildData" :src="guildData.icon"></v-img>
                  </v-list-item-avatar>
                  <v-list-item-content>
                    <v-menu offset-y>
                      <template v-slot:activator="{ on, attrs }">
                        <v-btn block outlined v-bind="attrs" v-on="on">
                          {{ selectedGuild.name ? selectedGuild.name : 'Select a guild'}}
                        </v-btn>
                      </template>
                      <v-list>
                        <v-list-item
                          v-for="guild in managedGuilds.filter(guild => guild.id !== selectedGuild.id)"
                          :key="guild.name"
                          @click="function() {
                            selectedGuild = guild;
                            apiReload();
                          }">
                            <v-list-item-title>{{ guild.name }}</v-list-item-title>
                        </v-list-item>
                      </v-list>
                    </v-menu>
                  </v-list-item-content>
            </v-list-item>
          </div>
        </template>

        <v-divider></v-divider>
        <v-list v-if="authed">

          <v-list-item>
            <v-list-item-icon>
              <i class="fas fa-columns"></i>
            </v-list-item-icon>
            <v-list-item-content>
              <v-list-item-title>Dashboard</v-list-item-title>
            </v-list-item-content>
          </v-list-item>

          <v-list-item>
            <v-list-item-icon>
              <i class="fas fa-headphones"></i>
            </v-list-item-icon>
            <v-list-item-content>
              <v-list-item-title>Audio Player</v-list-item-title>
            </v-list-item-content>
          </v-list-item>

          <v-list-item>
            <v-list-item-icon>
              <i class="fas fa-wrench"></i>
            </v-list-item-icon>
            <v-list-item-content>
              <v-list-item-title>Settings</v-list-item-title>
            </v-list-item-content>
          </v-list-item>
        </v-list>
        <v-divider></v-divider>
        <template v-slot:append>
          <v-list v-if="authed">
            <v-list-item class="px-2">
              <v-list-item-avatar>
                <v-img :src="'https://cdn.discordapp.com/avatars/' + userData.id + '/' + userData.avatar + '.png'"></v-img>
              </v-list-item-avatar>
              <v-list-item-content>
                {{userData.username + '#' + userData.discriminator}}
              </v-list-item-content>
            </v-list-item>
          </v-list>
          <div class="pa-2">
              <v-btn v-if="authed" href="/logout" block>
                <i class="fas fa-sign-out-alt"></i>
                Logout
              </v-btn>
              <v-btn v-else href="/oauth" block>Login to Discord</v-btn>
          </div>
        </template>
      </v-navigation-drawer>
      <v-main>
        <div v-if="selectedGuild.name">
          <div v-if="npData.title">
            <h1>Now Playing</h1>
            <NowPlaying :data="npData" />
            <div v-if="playQueue.length > 0">
              <h1>Audio Queue</h1>
              <SongQueue :queue-data="playQueue" />
            </div>
          </div>
          <div v-else>Nothing is currently playing</div>
        </div>
        <div v-else>No guild selected</div>
      </v-main>
    </v-container>
  </div>
</template>

<script>
import * as axios from 'axios';
import * as format from 'format-duration';
import io from 'socket.io-client';
export default {
    data: function() {
        return {
            authed: false,
            userData: undefined,
            managedGuilds: undefined,
            selectedGuild: {},
            guildData: undefined,
            npData: {},
            playQueue: [],
            status: undefined,
        };
    },
    methods: {
        async apiReload() {
            this.status = (await axios.get('/api/status')).data;
            const status = this.status;
            const guildId = this.selectedGuild.id;
            this.guildData = (await axios.get('/api/guilds/' + guildId)).data;
            this.playQueue = [];
            this.guildData.live.playQueue.forEach((song, index) => {
                this.playQueue.push({
                    pos: index,
                    name: song.title,
                    dur: format(song.duration * 1000),
                    requester: song.requester.displayName,
                    eta: 'TODO: Implement',
                });
            });
            this.authed = status.authed;
            this.userData = status.userData;
            this.managedGuilds = status.managedGuilds;
            if (this.guildData.live.nowPlaying) {
                this.npData = this.guildData.live.nowPlaying;
                this.npData.startTime = this.guildData.live.startTime;
                this.npData.totalTime = format(this.guildData.live.nowPlaying.duration * 1000);
            } else {
                this.npData = {};
            }
        },
    },
    async mounted() {
        const response = await axios.get('/api/status');
        this.authed = response.data.authed;
        this.userData = response.data.userData;
        this.managedGuilds = response.data.managedGuilds;
        const socket = io();
        socket.on('connect', () => {
            console.log('Socket connected!');
        });
        socket.on('update', (changed) => {
            if (this.selectedGuild.id === changed.guild) {
                this.apiReload();
            }
        });
    },
};

</script>
