const { REST, Routes } = require('discord.js');
const config = require('./config.json');

const rest = new REST({ version: '10' }).setToken(config.token);

//글로벌 명령어 삭제
(async () => {
  try {
    console.log('🚫 글로벌 명령어 삭제 중...');
    await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
    console.log('✅ 글로벌 명령어 삭제 완료!');
  } catch (error) {
    console.error('❌ 삭제 실패:', error);
  }
})();
