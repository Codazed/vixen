const Discord = require('discord.js');
const ffmpeg = require('ffmpeg-static');
const formatDuration = require('format-duration');
const fs = require('fs-extra');
const ora = require('ora');
const youtubedl = require('youtube-dl');

const config = {
    maxDuration: 900,
    defaultVolume: 0.35
};

class AudioController {
    constructor(vixen) {
        this.vixen = vixen;
        this.guildsMap = vixen.guildsData;
        this.audioPlayers = new Map();
        this._cleanGuildData();
    }

    _cleanGuildData(guild) {
        const cleanData = {
            playQueue: [],
            loop: false,
            nowPlaying: undefined,
            startTime: undefined,
        };
        if (guild === undefined) {
            this.vixen.bot.guilds.cache.forEach(guild => {
                this.guildsMap.set(guild.id, cleanData);
                this.audioPlayers.set(guild.id, undefined);
            });
        } else {
            this.guildsMap.set(guild.id, cleanData);
            this.audioPlayers.set(guild.id, undefined);
        }
    }

    async getSettings(guildId) {
        const query = await this.vixen.db.collection('guilds').findOne({id: guildId});
        const guildAudioSettings = query.audio ? new Map(Object.entries(query.audio)) : new Map();
        let settings = {};
        settings.volume = guildAudioSettings.get('volume') ? guildAudioSettings.get('volume') : config.defaultVolume;
        return settings;
    }

    getQueueDuration(guildId) {
        const guildData = this.guildsMap.get(guildId);
        const queueTil = guildData.playQueue.slice();
        queueTil.pop();
        const now = Date.now();
        const elapsed = now - guildData.startTime;
        let totalDuration = guildData.nowPlaying.duration * 1000 - elapsed;
        queueTil.forEach(video => {
            totalDuration += video.duration * 1000;
        });
        return totalDuration;
    }

    getTimeTilNext(guildId) {
        const guildData = this.guildsMap.get(guildId);
        const now = Date.now();
        const elapsed = now - guildData.startTime;
        return guildData.nowPlaying.duration * 1000 - elapsed;
    }

    getMaxDuration() {
        return config.maxDuration;
    }

    getQueue(guildId) {
        return this.guildsMap.get(guildId).playQueue;
    }

    async setVolume(guildId, level) {
        const audioPlayer = this.audioPlayers.get(guildId);
        audioPlayer.setVolume(level);
        this.vixen.db.collection('guilds').updateOne({id: guildId}, {$set: {'audio.volume': level}}, {upsert: true});
    }

    queue(guildId, audioJSON) {
        this.guildsMap.get(guildId).playQueue.push(audioJSON);
    }

    async checkQueue(guildMsg, queue = this.guildsMap.get(guildMsg.guild.id).playQueue.slice()) {
        const message = await guildMsg.channel.send('Downloading missing tracks... 0/' + queue.length);
        let position = 0;
        for (const data of queue) {
            position++;
            if (!fs.existsSync(`./cache/${data.id}.ogg`)) {
                message.edit(`Downloading missing tracks... ${position}/${queue.length}`);
                await this.download(data).catch(() => {
                    this.vixen.log(`Error downloading ${data.title}: Video is longer than the max duration of ${config.maxDuration} seconds. Skipping.`, 'err');
                });
            }
        }
        message.delete();
    }
    download(data) {
        return new Promise((resolve, reject) => {
            if (data.duration > config.maxDuration) {
                reject();
            } else {
                const downloadSpinner = ora(`Downloading '${data.title}'`).start();
                youtubedl.exec(data.url, ['--format', 'bestaudio', '-x', '--audio-format', 'vorbis', '--audio-quality', '64K', '-o', require('path').join(this.vixen.rootDir, 'cache/%(id)s.unprocessed'), '--rm-cache-dir', '--ffmpeg-location', ffmpeg], {}, function (err) {
                    if (err) throw err;
                    downloadSpinner.stop();
                    resolve();
                });
            }
        });
    }

    async play(guildId, audioJSON) {
        const guildData = this.guildsMap.get(guildId);
        let audioPlayer = this.audioPlayers.get(guildId);
        if (guildData.nowPlaying) {
            if (guildData.loop) {
                await audioJSON.channel.send('Warning: Loop is enabled for the currently playing video.');
                await this.vixen.later(2000);
            }
            this.queue(guildId, audioJSON);
            this.sendQueueEmbed(audioJSON, this.getQueueDuration);
        } else {
            if (audioJSON.vc) {
                const options = await this.getSettings(guildId);
                const connection = await audioJSON.vc.join();
                connection.voice.setSelfDeaf(true);
                audioPlayer = audioJSON.source === 'File' ? connection.play(require('path').join(this.vixen.rootDir, 'cache', audioJSON.filename), options) : connection.play(require('path').join(this.vixen.rootDir, 'cache', audioJSON.id + '.ogg'), options);
                this.audioPlayers.set(guildId, audioPlayer);
                guildData.nowPlaying = audioJSON;
                guildData.startTime = Date.now();
                this.sendNPEmbed(audioJSON);
                guildData.audioPlaying = true;
                audioPlayer.on('finish', async () => {
                    guildData.previousSong = guildData.nowPlaying;
                    guildData.nowPlaying = undefined;
                    guildData.startTime = undefined;
                    if (guildData.loop) {
                        this.play(guildId, audioJSON);
                    } else {
                        if (guildData.previousSong.source === 'File') {
                            fs.unlinkSync(`./cache/${guildData.previousSong.filename}`);
                        }
                        if (guildData.playQueue.length <= 0) {
                            await audioJSON.channel.send('Queue is empty. Disconnecting.');
                            audioJSON.vc.leave();
                        } else {
                            this.play(guildId, guildData.playQueue.shift());
                        }
                    }
                });
            }
        }
    }

    skip(guildId) {
        this.audioPlayers.get(guildId).end();
    }

    stop(guildId) {
        const guildData = this.guildsMap.get(guildId);
        const audioPlayer = this.audioPlayers.get(guildId);
        guildData.loop = false;
        guildData.playQueue = [];
        audioPlayer.end();
        this._cleanGuildData(guildId);
    }

    pause(guildId) {
        const audioPlayer = this.audioPlayers.get(guildId);
        audioPlayer.paused ? audioPlayer.resume() : audioPlayer.pause();
        return audioPlayer.paused;
    }

    toggleLoop(guildId) {
        const guildData = this.guildsMap.get(guildId);
        guildData.loop = !guildData.loop;
        return guildData.loop;
    }

    getVideoInfo(query) {
        return new Promise((resolve) => {
            const infoSpinner = ora(`Fetching info for query '${query}'...`).start();
            youtubedl.exec(query, ['--default-search', 'ytsearch', '--match-filter', `duration <= ${config.maxDuration}`, '--dump-json', '--skip-download'], {}, function (err, output) {
                if (err) throw err;
                if (output.join('\n').length > 0) {
                    let videoJSON = JSON.parse(output);
                    let passData = {
                        'query': query,
                        'title': videoJSON.title,
                        'uploader': videoJSON.uploader,
                        'url': videoJSON.webpage_url,
                        'id': videoJSON.id,
                        'thumbnail': videoJSON.thumbnails[0].url,
                        'duration': videoJSON.duration,
                        'source': videoJSON.extractor
                    };
                    resolve(passData);
                } else {
                    throw 'No videos found!';
                }
                infoSpinner.stop();
            });
        });
    }

    fetchPlaylist(url, loadMsg, vixen) {
        const getInfo = this.getVideoInfo;
        return new Promise(resolve => {
            youtubedl.exec(url, ['--default-search', 'ytsearch', '--dump-json', '--skip-download', '--flat-playlist'], {}, async function (err, output) {
                if (err) throw err;
                let rawJSON = JSON.parse(`{"videos": [${output.toString()}]}`);
                let playlistJSON = [];
                for (const video of rawJSON.videos) {
                    loadMsg.edit(`${vixen.getEmoji(loadMsg.guild, 'loading')} Retrieving information for video ${playlistJSON.length + 1}/${rawJSON.videos.length}: \`${video.title}\`. This will take a moment...`);
                    const info = await getInfo('https://youtube.com/watch?v=' + video.id);
                    playlistJSON.push(info);
                }
                resolve(playlistJSON);
            });
        });
    }

    sendNPEmbed(data) {
        const embed = new Discord.MessageEmbed();
        embed.setColor('#ff0000');
        data.source === 'youtube' ? embed.setTitle('YouTube') : embed.setTitle(data.source);
        embed.setDescription(`Playing video requested by ${data.requester.displayName}`);
        embed.setThumbnail(data.requester.user.avatarURL());
        embed.addField('Video', data.title);
        embed.addField('Uploader', data.uploader, true);
        embed.addField('Duration', formatDuration(data.duration * 1000), true);
        embed.setImage(data.thumbnail);
        embed.setURL(data.url);
        data.channel.send(embed);
    
    }
    
    sendQueueEmbed(data) {
        const embed = new Discord.MessageEmbed();
        embed.setColor('#ff0000');
        data.source === 'youtube' ? embed.setTitle('YouTube') : embed.setTitle(data.source);
        embed.setDescription(`${data.requester.displayName} added a video to the queue`);
        embed.setThumbnail(data.thumbnail);
        embed.addField('Video', data.title);
        embed.addField('Uploader', data.uploader, true);
        embed.addField('Duration', formatDuration(data.duration * 1000), true);
        embed.addField('ETA', `${formatDuration(this.getQueueDuration(data.requester.guild.id))}`, true);
        embed.setURL(data.url);
        data.channel.send(embed);
    }
}

module.exports = AudioController;