module.exports = {
  name: 'stop',
  description: 'Stop playing music.',
  execute(msg, args, vixen) {
    vixen.audioController.stop(msg.guild.id);
  },
};
