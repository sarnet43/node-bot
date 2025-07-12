require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { 
  Client, GatewayIntentBits, Events, REST, Routes, 
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, SlashCommandBuilder 
} = require('discord.js');
const dayjs = require('dayjs');
const cron = require('node-cron');
const { isHoliday } = require('@kokr/date');
const {
  registerStudent,
  getStudent,
  recordAttendance,
  getTodayAttendance,
  getMonthlyStats,
  getMyAttendance
} = require('./db-service');

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: ['CHANNEL', 'MESSAGE', 'USER']
});

const GUILD_ID = process.env.GUILD_ID;

const commands = [
  new SlashCommandBuilder().setName('학생등록').setDescription('자기 정보 등록하기'),
  new SlashCommandBuilder().setName('지각').setDescription('지각 신고하기'),
  new SlashCommandBuilder().setName('결석').setDescription('결석 신고하기'),
  new SlashCommandBuilder().setName('병결').setDescription('병결 신고 및 확인서 첨부'),
  new SlashCommandBuilder().setName('출결확인').setDescription('오늘 출결 현황 보기 (교사 전용)'),
  new SlashCommandBuilder().setName('출결통계').setDescription('이번 달 출결 통계 보기 (교사 전용)'),
  new SlashCommandBuilder()
    .setName('내출결확인')
    .setDescription('내 출결 내역 보기')
    .addStringOption(option =>
      option.setName('상태')
        .setDescription('출결 상태 선택')
        .setRequired(false)
        .addChoices(
          { name: '전체', value: '전체' },
          { name: '지각', value: '지각' },
          { name: '결석', value: '결석' },
          { name: '병결', value: '병결' }
        ))
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    console.log('명령어 등록 중...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('명령어 등록 완료!');
  } catch (error) {
    console.error(error);
  }
})();

client.once(Events.ClientReady, async readyClient => {
  console.log(`디스코드 봇이 준비됨 ${readyClient.user.tag}`);

  cron.schedule('0 0 7 * * *', async () => {
    const today = new Date();
    if (isHoliday(today)) {
      console.log('오늘은 공휴일이라 알림을 보내지 않습니다.');
      return;
    }
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const channel = await guild.channels.fetch(process.env.ALERT_CHANNEL_ID);
      if (channel && channel.isTextBased()) {
        await channel.send('⏰ 오늘 출결 체크 잊지 마세요! 모두 좋은 하루 보내세요!');
        console.log('알람 메시지 전송 완료');
      }
    } catch (err) {
      console.error('알람 메시지 전송 중 오류:', err);
    }
  });
});

client.on(Events.InteractionCreate, async interaction => {
  const userId = interaction.user.id;

  if (interaction.isChatInputCommand()) {
    const cmd = interaction.commandName;

    if (cmd === '학생등록') {
      const modal = new ModalBuilder()
        .setCustomId('modal_register')
        .setTitle('학생 등록')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('name').setLabel('이름').setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('grade').setLabel('학년').setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('class').setLabel('반').setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('number').setLabel('번호').setStyle(TextInputStyle.Short).setRequired(true)
          )
        );
      return interaction.showModal(modal);
    }

    if (cmd === '지각' || cmd === '결석') {
      const student = await getStudent(userId);
      if (!student) {
        return interaction.reply({ content: '❗ 먼저 /학생등록 으로 정보를 등록해주세요.' });
      }

      const isLate = cmd === '지각';
      const modal = new ModalBuilder()
        .setCustomId(isLate ? 'modal_late' : 'modal_absent')
        .setTitle(isLate ? '지각 신고서' : '결석 신고서')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('reason').setLabel('사유 (선택)').setStyle(TextInputStyle.Paragraph).setRequired(false)
          )
        );

      return interaction.showModal(modal);
    }

    if (cmd === '병결') {
      const student = await getStudent(userId);
      if (!student) {
        return interaction.reply({ content: '❗ 먼저 /학생등록 으로 정보를 등록해주세요.' });
      }

      return interaction.reply({ 
        content: '🧾 병결 확인서를 이 채널에 파일로 첨부해주세요. (이미지 또는 PDF 형식)' });
    }

    if (cmd === '출결확인') {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.roles.cache.some(r => r.name === '교사')) {
        return interaction.reply({ content: '❌ 교사 역할만 사용 가능합니다.' });
      }

      const list = await getTodayAttendance();
      if (!list.length) {
        return interaction.reply({ content: '오늘 출결 기록이 없습니다.' });
      }

      const msg = list.map(s => `${s.grade}학년 ${s.class}반 ${s.number}번 ${s.name} - ${s.status} (${s.reason})`).join('\n');
      return interaction.reply({ content: `📋 오늘 출결 현황\n\n${msg}` });
    }

    if (cmd === '출결통계') {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.roles.cache.some(r => r.name === '교사')) {
        return interaction.reply({ content: '❌ 교사 역할만 사용 가능합니다.' });
      }

      const stats = await getMonthlyStats();
      if (!stats.length) {
        return interaction.reply({ content: '이번 달 출결 기록이 없습니다.' });
      }

      const msg = stats.map(s => `${s.grade}학년 ${s.class}반 ${s.number}번 ${s.name} → 지각: ${s.late}, 결석: ${s.absent}`).join('\n');
      return interaction.reply({ content: `📆 이번 달 출결 통계\n\n${msg}` });
    }

    if (cmd === '내출결확인') {
      const statusFilter = interaction.options.getString('상태') || '전체';
      const list = await getMyAttendance(userId, statusFilter);
      if (!list.length) {
        return interaction.reply({ content: '출결 기록이 없습니다.' });
      }

      const msg = list.map(r => {
        const date = dayjs(r.date).format('YYYY-MM-DD');
        const file = r.file_url 
          ? `\n📎 첨부파일:\n${r.file_url.startsWith('http') ? r.file_url : `${process.env.BASE_URL}${r.file_url}`}` 
          : '';
        return `📅 ${date} - ${r.status} (${r.reason})${file}`;
      }).join('\n');

      return interaction.reply({ content: `🗂️ ${list.length}건의 출결 기록 (${statusFilter})\n\n${msg}` });
    }
  }

  if (interaction.isModalSubmit()) {
    const id = interaction.customId;

    if (id === 'modal_register') {
      const name = interaction.fields.getTextInputValue('name');
      const grade = parseInt(interaction.fields.getTextInputValue('grade'));
      const cls = parseInt(interaction.fields.getTextInputValue('class'));
      const number = parseInt(interaction.fields.getTextInputValue('number'));

      await registerStudent({ userId, name, grade, classNum: cls, number });
      return interaction.reply({ content: `✅ ${name}님 정보가 등록되었습니다.` });
    }

    if (id === 'modal_late' || id === 'modal_absent') {
      const status = id === 'modal_late' ? '지각' : '결석';
      const reason = interaction.fields.getTextInputValue('reason') || '사유 없음';
      await recordAttendance({ userId, status, reason });
      return interaction.reply({ content: `✅ ${status}이 등록되었습니다.` });
    }
  }
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  if (message.attachments.size === 0) return;

  const student = await getStudent(message.author.id);
  if (!student) return;

  const file = message.attachments.first();
  const fileName = `${message.author.id}_${Date.now()}_${file.name}`;
  const uploadDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
  }

  const filePath = path.join(uploadDir, fileName);
  const fileUrl = `${process.env.BASE_URL}/uploads/${fileName}`;

  // Node.js 내장 fetch 사용, response 체크
  const response = await fetch(file.url);
  if (!response.ok) {
    console.error('첨부파일 다운로드 실패:', response.status, response.statusText);
    return await message.reply('❗ 첨부파일 다운로드에 실패했습니다. 다시 시도해주세요.');
  }
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(filePath, Buffer.from(buffer));

  await recordAttendance({
    userId: message.author.id,
    status: '병결',
    reason: '병결 확인서 제출',
    fileUrl
  });

  await message.reply('✅ 병결 및 파일이 등록되었습니다.');
});

client.login(process.env.DISCORD_TOKEN);
