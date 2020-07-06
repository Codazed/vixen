const Discord = require('discord.js');
const formatDuration = require('format-duration');
const fs = require('fs-extra');
const ora = require('ora');
const youtubedl = require('youtube-dl');

const guildsMap = new Map();

const config = {
    maxDuration: 900,
    defaultVolume: 0.35
};

class AudioController {
    constructor(vixen) {
        this.vixen = vixen;
        this._cleanGuildData();
    }

    _cleanGuildData(guild) {
        const cleanData = {
            playQueue: [],
            loop: false,
            nowPlaying: undefined,
            startTime: undefined,
            audioPlayer: undefined
        };
        if (guild === undefined) {
            this.vixen.bot.guilds.cache.forEach(guild => {
                guildsMap.set(guild.id, cleanData);
            });
        } else {
            guildsMap.set(guild.id, cleanData);
        }
    }

    getSettings(guildId) {
        const query = this.vixen.db.prepare(`SELECT * FROM '${guildId}' WHERE id=?`);
        let settings = {};
        settings.volume = query.get('volume') ? query.get('volume').value : config.defaultVolume;
        return settings;
    }

    getQueueDuration(guildId) {
        return getQueueDuration(guildId);
    }

    getTimeTilNext(guildId) {
        const guildData = guildsMap.get(guildId);
        const now = Date.now();
        const elapsed = now - guildData.startTime;
        return guildData.nowPlaying.duration * 1000 - elapsed;
    }

    getMaxDuration() {
        return config.maxDuration;
    }

    getQueue(guildId) {
        return guildsMap.get(guildId).playQueue;
    }

    setVolume(guildId, level) {
        const guildData = guildsMap.get(guildId);
        guildData.audioPlayer.setVolume(level);
        if (this.vixen.db.prepare(`SELECT * FROM '${guildId}' WHERE id=?`).get('volume')) {
            this.vixen.db.prepare(`UPDATE '${guildId}' SET value=? WHERE id=?`).run(level, 'volume');
        } else {
            this.vixen.db.prepare(`INSERT INTO '${guildId}' (id, value) VALUES (?, ?)`).run('volume', level);
        }
    }

    queue(guildId, audioJSON) {
        guildsMap.get(guildId).playQueue.push(audioJSON);
    }

    async checkQueue(guildId, queue = guildsMap.get(guildId).playQueue.slice()) {
        for (const data of queue) {
            if (!fs.existsSync(`./cache/${data.id}.ogg`)) {
                await this.download(data).catch(() => {
                    this.vixen.log(`Error downloading ${data.title}: Video is longer than the max duration of ${config.maxDuration} seconds. Skipping.`, 'err');
                });
            }
        }
    }
    download(data) {
        return new Promise((resolve, reject) => {
            if (data.duration > config.maxDuration) {
                reject();
            } else {
                const downloadSpinner = ora(`Downloading '${data.title}'`).start();
                youtubedl.exec(data.url, ['--format', 'bestaudio', '-x', '--audio-format', 'vorbis', '--audio-quality', '64K', '-o', './cache/%(id)s.unprocessed', '--rm-cache-dir'], {}, function (err) {
                    if (err) throw err;
                    downloadSpinner.stop();
                    resolve();
                });
            }
        });
    }

    async play(guildId, audioJSON) {
        const guildData = guildsMap.get(guildId);
        if (guildData.nowPlaying) {
            if (guildData.loop) {
                await audioJSON.channel.send('Warning: Loop is enabled for the currently playing video.');
                await this.vixen.later(2000);
            }
            this.queue(guildId, audioJSON);
            sendQueueEmbed(audioJSON);
        } else {
            if (audioJSON.vc) {
                const options = this.getSettings(guildId);
                const connection = await audioJSON.vc.join();
                connection.voice.setSelfDeaf(true);
                guildData.audioPlayer = audioJSON.source === 'File' ? connection.play(`./cache/${audioJSON.filename}`, options) : connection.play(`./cache/${audioJSON.id}.ogg`, options);
                guildData.nowPlaying = audioJSON;
                guildData.startTime = Date.now();
                sendNPEmbed(audioJSON);
                guildData.audioPlaying = true;
                guildData.audioPlayer.on('finish', async () => {
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
        guildsMap.get(guildId).audioPlayer.end();
    }

    stop(guildId) {
        const guildData = guildsMap.get(guildId);
        guildData.loop = false;
        guildData.playQueue = [];
        guildData.audioPlayer.end();
        this._cleanGuildData(guildId);
    }

    pause(guildId) {
        const guildData = guildsMap.get(guildId);
        guildData.audioPlayer.paused ? guildData.audioPlayer.resume() : guildData.audioPlayer.pause();
        return guildData.audioPlayer.paused;
    }

    toggleLoop(guildId) {
        const guildData = guildsMap.get(guildId);
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
}

function getQueueDuration(guildId) {
    const guildData = guildsMap.get(guildId);
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

function sendNPEmbed(data) {
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

function sendQueueEmbed(data) {
    const embed = new Discord.MessageEmbed();
    embed.setColor('#ff0000');
    data.source === 'youtube' ? embed.setTitle('YouTube') : embed.setTitle(data.source);
    embed.setDescription(`${data.requester.displayName} added a video to the queue`);
    embed.setThumbnail(data.thumbnail);
    embed.addField('Video', data.title);
    embed.addField('Uploader', data.uploader, true);
    embed.addField('Duration', formatDuration(data.duration * 1000), true);
    embed.addField('ETA', `${formatDuration(getQueueDuration(data.requester.guild.id))}`, true);
    embed.setURL(data.url);
    data.channel.send(embed);
}

module.exports = AudioController;