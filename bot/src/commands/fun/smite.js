const SmiteBuilder = require('smite-builder');
const builder = new SmiteBuilder();

module.exports = {
  name: 'smite',
  description: 'Generate a random god and build for Smite',
  async execute(msg) {
    await builder.getLists();
    const player = builder.makePlayer();
    let replyString = `Here is your generated build:\n**${player.god.name}**`;
    player.build.items.forEach((item) => {
      replyString += `\n${item.name}`;
    });
    msg.reply(replyString);
  },
};
