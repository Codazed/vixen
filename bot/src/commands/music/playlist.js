const chalk = require('chalk');
const fs = require('fs-extra');
const got = require('got');
const path = require('path');
const youtubedl = require('youtube-dl');
const ytRegex = require('youtube-regex');

module.exports = {
  name: 'playlist',
  description: 'Manage playlists',
  async execute(msg, args, vixen) {
    const controller = vixen.audioController;
    const datadir = path.join('./data', msg.guild.id);
    fs.ensureDirSync(path.join(datadir, 'playlists'));

    // Create empty playlist
    if (args[0] === 'create') {
      const name = args[1];
      if (exists(msg.guild.id, name)) {
        await msg.channel.send(`A playlist with the name \`${name}\` already exists!`);
      } else {
        createNewPlaylist(msg.guild.id, name, msg.author.id);
        await msg.channel.send(`Playlist \`${name}\` successfully created. Add things to it with ${vixen.config.prefix}playlist add ${name} \`video url\``);
      }
    }

    // Delete playlist
    else if (args[0] === 'delete') {
      const name = args[1];
      if (!exists(msg.guild.id, name)) {
        await msg.channel.send(`A playlist with the name \`${name}\` does not exist!`);
      } else {
        fs.unlinkSync(path.join(datadir, 'playlists', name + '.json'));
        vixen.log(`${chalk.gray(`(${msg.guild.id})`)} Deleted playlist ${chalk.cyan(name)}`);
        await msg.channel.send(`Playlist \`${name}\` was successfully deleted.`);
      }
    }

    // Add items to a playlist
    else if (args[0] === 'add') {
      const name = args[1];
      if (!exists(msg.guild.id, name)) {
        createNewPlaylist(msg.guild.id, name, msg.author.id);
      }
      const url = args[2];
      if (ytRegex().test(url)) {
        const playlist = getPlaylist(msg.guild.id, name);
        playlist.size++;
        const info = await controller.getVideoInfo(url);
        playlist.videos.push(info);
        savePlaylist(msg.guild.id, name, playlist);
        vixen.log(`${chalk.gray(`(${msg.guild.id})`)} Added ${chalk.yellow(url)} to playlist ${chalk.cyan(name)}`);
        msg.channel.send(`Added \`${url}\` to playlist \`${name}\`.`);
      }
    }

    // Remove items from a playlist
    else if (args[0] === 'remove') {
      const name = args[1];
      if (!exists(msg.guild.id, name)) {
        return await msg.channel.send(`A playlist with the name \`${name}\` does not exist!`);
      }
      const url = args[2];
      if (ytRegex().test(url)) {
        const idRegex = /.*(?:youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=)([^#&?]*).*/;
        const match = url.match(idRegex);
        const id = match[1];
        const playlist = getPlaylist(msg.guild.id, name);
        const newvids = [];
        playlist.videos.forEach((item) => {
          if (item.id !== id) {
            newvids.push(item);
          }
        });
        playlist.videos = newvids;
        playlist.size = newvids.length;
        savePlaylist(msg.guild.id, name, playlist);
        vixen.log(`${chalk.gray(`(${msg.guild.id})`)} Removed all instances of ${chalk.yellow(url)} from playlist ${chalk.cyan(name)}`);
        await msg.channel.send(`Removed all instances of \`${url}\` from playlist \`${name}\`.`);
      }
    }

    // Import playlist from YouTube
    else if (args[0] === 'import') {
      const url = args[1];
      const name = args[2];
      if (exists(msg.guild.id, name)) {
        return await msg.channel.send(`A playlist with the name \`${name}\` already exists!`);
      }
      const loadMsg = await msg.channel.send(`${vixen.getEmoji(msg.guild, 'loading')} Fetching playlist information...`);
      const playlistData = await controller.fetchPlaylist(url, loadMsg, vixen);
      const playlist = {
        name: name,
        creator: msg.author.id,
        size: playlistData.length,
        videos: playlistData,
      };
      savePlaylist(msg.guild.id, name, playlist);
      loadMsg.delete();
      msg.channel.send(`Playlist \`${url}\` successfully imported to playlist with the name \`${name}\``);
    }

    // Import playlist JSON from Discord
    else if (args[0] === 'importjson') {
      if (msg.attachments.size <= 0) return;
      const attachment = msg.attachments.first();
      if (attachment.name.endsWith('.json')) {
        const name = attachment.name.replace('.json', '');
        if (exists(msg.guild.id, name)) {
          await msg.channel.send(`A playlist with the name \`${name}\` already exists!`);
        }
        const response = await got(attachment.url);
        const listJSON = JSON.parse(response.body);

        // Future parsing of list JSON to make sure it isn't malformed
        fs.writeFileSync(path.join(datadir, 'playlists', name), JSON.stringify(listJSON, '', ' '));
      }
    }

    // Export playlist JSON to Discord
    else if (args[0] === 'export') {
      const name = args[1];
      if (!exists(msg.guild.id, name)) await msg.channel.send(`A playlist with the name \`${name}\` does not exist!`);
      else {
        await msg.channel.send(`Here is the JSON file for the playlist \`${name}\`. Do with it what you will.`, {files: [{
          attachment: `./data/${msg.guild.id}/playlists/${name}.json`,
          name: `${name}.json`,
        }]});
      }
    }

    // Play playlist in order
    else if (args[0] === 'play') {
      const name = args[1];
      if (!exists(msg.guild.id, name)) await msg.channel.send(`A playlist with the name \`${name}\` does not exist!`);
      else {
        queuePlaylist(msg, getPlaylist(msg.guild.id, name), false, vixen.audioController);
      }
    }

    // Play playlist in random order
    else if (args[0] === 'mix' || args[0] === 'shuffle') {
      const name = args[1];
      if (!exists(msg.guild.id, name)) await msg.channel.send(`A playlist with the name \`${name}\` does not exist!`);
      else {
        queuePlaylist(msg, getPlaylist(msg.guild.id, name), true, vixen.audioController);
      }
    }

    // List all playlists in a guild
    else if (args[0] === 'list') {
      const playlists = [];
      fs.readdirSync(path.join(datadir, 'playlists')).forEach((file) => {
        playlists.push(file);
      });
      const playlistsData = [];
      playlists.forEach((list) => {
        const name = list.replace('.json', '');
        playlistsData.push(getPlaylist(msg.guild.id, name));
      });
      if (playlistsData.length <= 0) return msg.channel.send('There are no playlists on this server.');
      let messageString = 'Here is a list of all the playlists available on this server:';
      playlistsData.forEach((playlist) => {
        messageString += `\n- ${playlist.name} : ${playlist.size} tracks`;
      });
      msg.channel.send(messageString);
    }
  },
};

function createNewPlaylist(guildId, name, creatorId) {
  const dir = path.join('./data', guildId, 'playlists');
  const playlistInfo = {
    name: name,
    creator: creatorId,
    size: 0,
    videos: [],

  };
  fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(playlistInfo, '', ' '));
}

function exists(guildId, name) {
  const dir = path.join('./data', guildId, 'playlists');
  return fs.existsSync(path.join(dir, name + '.json'));
}

function getPlaylist(guildId, name) {
  const dir = path.join('./data', guildId, 'playlists');
  const playlist = fs.readFileSync(path.join(dir, name + '.json'));
  return JSON.parse(playlist);
}

async function queuePlaylist(msg, playlist, shuffle, controller) {
  let videos = playlist.videos;
  if (shuffle) videos = require('knuth-shuffle-seeded')(videos);
  // Check if first video in queue is downloaded
  const first = videos.shift();
  let newData = first;
  newData.vc = msg.member.voice.channel;
  newData.channel = msg.channel;
  newData.requester = msg.member;
  function queueRest() {
    videos.forEach((item) => {
      newData = item;
      newData.vc = msg.member.voice.channel;
      newData.channel = msg.channel;
      newData.requester = msg.member;
      controller.queue(msg.guild.id, newData);
    });
    controller.checkQueue(msg);
  }
  if (fs.existsSync(path.join('./cache', first.id + '.ogg'))) {
    controller.play(newData.requester.guild.id, newData);
  } else {
    await controller.download(newData);
    controller.play(newData.requester.guild.id, newData);
  }
  queueRest();
}

function savePlaylist(guildId, name, newData) {
  const dir = path.join('./data', guildId, 'playlists');
  fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(newData, '', ' '));
}
