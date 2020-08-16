module.exports = {
  name: 'volume',
  description: 'Adjust stream volume',
  async execute(msg, args, vixen) {
    const controller = vixen.audioController;
    const maxVolume = 150;
    if (args[0]) {
      let properValue;
      if (args[0] > maxVolume) {
        properValue = maxVolume*0.01;
      } else {
        properValue = args[0]*0.01;
      }
      controller.setVolume(msg.guild.id, properValue);
      msg.channel.send(`Set the volume to ${properValue*100}%`);
    } else {
      const settings = controller.getSettings(msg.guild.id);
      msg.channel.send(`The volume is currently set to ${settings.volume*100}%`);
    }
  },
};
