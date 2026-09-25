import express from "express";
import { PermissionFlagsBits } from 'discord.js';
import { normalizeDiscordName, getDiscordClient, pollResultsCache, CACHE_TTL } from './common';
import { loadDb, saveDb } from './localDb';

const router = express.Router();

/**
 * Bot còn thiếu quyền nào ở kênh này.
 *
 * Discord trả về đúng hai chữ "Missing Permissions" cho mọi trường hợp thiếu quyền, không
 * nói thiếu cái gì cũng không nói ở kênh nào. Bản cũ ném thẳng chuỗi đó ra màn hình, người
 * dùng chỉ biết là hỏng chứ không biết đi sửa ở đâu.
 *
 * Đăng bình chọn cần RIÊNG một quyền "Tạo bình chọn", tách khỏi "Gửi tin nhắn". Đây là chỗ
 * hay dính nhất: bot đăng đội hình vào kênh đó ngon lành nhưng tạo poll thì trượt, nhìn vào
 * tưởng bot bị chặn cả kênh.
 */
function thieuQuyen(channel: any, client: any): string[] {
  const q = channel?.permissionsFor?.(client.user);
  if (!q) return [];   // nhắn riêng, không phải kênh server -> không có bảng quyền để soi

  const can: [bigint, string][] = [
    [PermissionFlagsBits.ViewChannel, 'Xem kênh'],
    [PermissionFlagsBits.SendMessages, 'Gửi tin nhắn'],
  ];
  // Quyền này Discord mới thêm, phòng bản discord.js cũ chưa có hằng số.
  const quyenPoll = (PermissionFlagsBits as any).SendPolls;
  if (quyenPoll) can.push([quyenPoll, 'Tạo bình chọn (Create Polls)']);

  return can.filter(([bit]) => !q.has(bit)).map(([, ten]) => ten);
}

/**
 * Chuẩn hoá tên lựa chọn trước khi so.
 *
 * Discord CẮT khoảng trắng thừa ở đầu và cuối tên lựa chọn, còn tool thì lưu nguyên chuỗi
 * người dùng gõ. Gõ lỡ tay một dấu cách cuối là hai bên lệch nhau vĩnh viễn.
 * Hậu quả thật đã đo được trên máy chủ: lựa chọn "Trận 4 tùy tâm trạng " (21 ký tự) trong DB
 * không khớp "Trận 4 tùy tâm trạng" (20 ký tự) của Discord, nên bảng kết quả THÊM MỚI một
 * lựa chọn thứ 5 chứa 4 người vote, còn lựa chọn thứ 4 mà giao diện đang trỏ tới thì rỗng.
 * Nhìn từ ngoài: "vote 4 người mà danh sách trống".
 */
const chuanTen = (s: any) => String(s ?? '').trim();

/**
 * Phiếu của MỘT lựa chọn: tên lựa chọn + những người đã bấm nó.
 *
 * Dùng cho cả poll đang chạy lẫn phiếu gánh sang từ poll cũ (xem route /repost).
 */
type Phieu = { text: string; users: { id: string; name: string; avatar: string }[] };

async function docPhieu(message: any): Promise<Phieu[]> {
  const ra: Phieu[] = [];
  for (const [, answer] of message.poll.answers) {
    const voters = await answer.voters.fetch();
    ra.push({
      text: answer.text,
      users: voters.map((v: any) => ({
        id: v.id,
        name: normalizeDiscordName(v.displayName || v.username),
        avatar: v.displayAvatarURL(),
      })),
    });
  }
  return ra;
}

/**
 * Gộp phiếu poll đang chạy với phiếu gánh sang từ poll cũ.
 *
 * ⚠️ AI ĐÃ VOTE Ở POLL MỚI THÌ BỎ HẾT PHIẾU CŨ CỦA HỌ, kể cả khi họ chọn lựa chọn khác.
 * Giữ cả hai thì người đổi ý từ "Tham gia" sang "Không tham gia" sẽ nằm ở CẢ HAI danh sách,
 * và bảng xếp đội đọc ra một người vừa đi vừa không đi.
 */
export function gopPhieu(moi: Phieu[], cu: Phieu[] = []): Phieu[] {
  if (!cu?.length) return moi;
  const daVoteLai = new Set(moi.flatMap((p) => p.users.map((u) => u.id)));
  const ra: Phieu[] = moi.map((p) => ({ text: p.text, users: [...p.users] }));
  for (const p of cu) {
    const giu = (p.users || []).filter((u) => !daVoteLai.has(u.id));
    if (!giu.length) continue;
    const o = ra.find((x) => chuanTen(x.text) === chuanTen(p.text));
    if (!o) { ra.push({ text: p.text, users: giu }); continue; }
    const daCo = new Set(o.users.map((u) => u.id));
    o.users.push(...giu.filter((u) => !daCo.has(u.id)));
  }
  return ra;
}

function loiQuyen(tenKenh: string, thieu: string[]): string {
  const ds = thieu.length ? `: ${thieu.join(', ')}` : '';
  return `Bot thiếu quyền ở kênh ${tenKenh}${ds}. `
    + 'Cách sửa: vào Discord, chuột phải kênh đó, Chỉnh sửa kênh, mục Quyền, thêm role của bot '
    + 'và bật các quyền trên. Lưu ý "Tạo bình chọn" là quyền RIÊNG, có "Gửi tin nhắn" rồi vẫn '
    + 'có thể thiếu nó.';
}

/** Mở kênh + soi quyền trước khi gửi. Trả { channel, tenKenh } hoặc { ma, loi } để trả thẳng về client. */
async function moKenhDangPoll(client: any, channelId: string) {
  if (!channelId) {
    return { ma: 400, loi: 'Chưa chọn kênh đăng poll. Vào Cấu hình Discord chọn kênh chữ để đăng poll.' };
  }
  const channel: any = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    return { ma: 400, loi: `Không mở được kênh (ID: ${channelId}). Kênh đã bị xoá, hoặc bot không có quyền Xem kênh.` };
  }
  if (!channel.isTextBased()) {
    return { ma: 400, loi: `Kênh ${channel.name ? `#${channel.name}` : channelId} không nhận tin nhắn. Chọn một kênh chữ để đăng poll.` };
  }
  const tenKenh = channel.name ? `#${channel.name}` : `ID ${channelId}`;
  // Soi quyền TRƯỚC KHI gửi. Để Discord từ chối rồi mới đoán ngược thì chỉ có đúng hai chữ
  // "Missing Permissions" mà lần.
  const thieu = thieuQuyen(channel, client);
  if (thieu.length) return { ma: 403, loi: loiQuyen(tenKenh, thieu) };
  return { channel, tenKenh };
}

/** Gửi poll, đổi lỗi 50013 của Discord thành câu chỉ đúng chỗ cần sửa. */
async function guiPoll(channel: any, tenKenh: string, client: any, poll: any) {
  try {
    return await channel.send({ poll });
  } catch (e: any) {
    // 50013 = Missing Permissions. Bảng quyền ở trên có thể nói "đủ" mà vẫn trượt: quyền
    // theo role bị một overwrite khác của kênh đè xuống. Vẫn phải chỉ đường chứ đừng ném
    // nguyên chuỗi tiếng Anh của Discord ra màn hình.
    if (e?.code === 50013) {
      const err: any = new Error(loiQuyen(tenKenh, thieuQuyen(channel, client)));
      err.ma = 403;
      throw err;
    }
    throw e;
  }
}

router.post('/poll/:groupID', async (req, res) => {
  const { groupID } = req.params;
  const client = await getDiscordClient(groupID);
  if (!client || !client.isReady()) {
    return res.status(400).json({ error: 'Bot is not connected' });
  }
  try {
    const { question, answers, allowMultiselect, duration, optionMappings, isGvg, channelId: bodyChannelId } = req.body;
    
    const localData = loadDb();
    const data = localData.groups[groupID]?.configs?.discord || {};
    // Ưu tiên kênh CHỮ dành riêng cho poll. Trước đây rơi thẳng về data.channelId, mà đó là
    // kênh VOICE (tool bắt buộc voice để lấy danh sách thành viên) -> poll chui vào khung
    // chat của kênh voice, báo thành công mà không ai thấy.
    const channelId = bodyChannelId || data.pollChannelId || data.channelId;
    const kenh = await moKenhDangPoll(client, channelId);
    if (kenh.loi) return res.status(kenh.ma!).json({ error: kenh.loi });
    const { channel, tenKenh } = kenh as { channel: any; tenKenh: string };

    const pollQuestion = chuanTen(question) || "Mọi người tiếp tục đánh hay nghỉ?";
    // CẮT khoảng trắng thừa ngay từ lúc tạo. Discord cắt của nó, mình không cắt thì hai bên
    // lệch nhau và mọi lần đọc kết quả sau này đều trượt. Vá chỗ đọc chỉ chữa được poll đã
    // lỡ tạo; chặn ở đây mới hết đẻ thêm.
    const pollAnswers = (answers && Array.isArray(answers) && answers.length > 0)
      ? answers.map((a: string) => ({ text: chuanTen(a) })).filter((a: any) => a.text)
      : [
          { text: "Tham gia" },
          { text: "Không tham gia" },
          { text: "Dự bị (Nhường slot, sẽ tham gia nếu thiếu người)" }
        ];

    const choPhep = allowMultiselect ?? false;
    const gioChay = duration ?? 168;
    const message: any = await guiPoll(channel, tenKenh, client, {
      question: { text: pollQuestion },
      answers: pollAnswers,
      allowMultiselect: choPhep,
      duration: gioChay,
    });

    const pollState = {
      messageId: message.id,
      channelId: message.channelId,
      guildId: message.guildId,
      createdAt: Date.now(),
      isGvg: isGvg || false,
      answers: pollAnswers.map((a: any) => a.text),
      // Ba trường dưới để route /repost dựng lại y hệt poll này. Trước đây không lưu câu hỏi
      // nên gửi lại là mất câu hỏi gốc, phải đọc ngược từ tin nhắn cũ — mà tin cũ có thể đã
      // bị xoá, đúng lúc cần gửi lại nhất.
      question: pollQuestion,
      allowMultiselect: choPhep,
      duration: gioChay,
      // Khoá của bảng ánh xạ cũng phải chuẩn hoá, không thì nó lệch với answers vừa cắt ở trên.
      optionMappings: optionMappings
        ? Object.fromEntries(Object.entries(optionMappings).map(([k, v]) => [chuanTen(k), v]))
        : {
            "Tham gia": 1,
            "Không tham gia": 0,
            "Dự bị (Nhường slot, sẽ tham gia nếu thiếu người)": 2
          }
    };
    
    const pollType = req.query.type === 'gvg' ? 'gvg' : 'regular';
    if (!localData.groups[groupID]) {
      localData.groups[groupID] = { members: [], accounts: {}, configs: {}, setups: {}, polls: {} };
    }
    if (!localData.groups[groupID].polls) {
      localData.groups[groupID].polls = {};
    }
    localData.groups[groupID].polls![pollType] = pollState;
    saveDb(localData);
    
    const stateFile = req.query.type === 'gvg' ? `${groupID}/gvg-poll-state` : `${groupID}/poll-state`;
    delete pollResultsCache[stateFile];
    
    res.json(pollState);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/poll/:groupID', async (req, res) => {
  try {
    const { groupID } = req.params;
    const pollType = req.query.type === 'gvg' ? 'gvg' : 'regular';
    const localData = loadDb();
    const poll = localData.groups[groupID]?.polls?.[pollType] || null;
    res.json(poll);
  } catch (error) {
    res.json(null);
  }
});

/**
 * GỬI LẠI POLL — poll cũ bị trôi lên trên trong kênh thì đăng lại một cái y hệt ở cuối kênh,
 * mà VẪN GIỮ những người đã vote.
 *
 * ⚠️ Discord KHÔNG cho bỏ phiếu hộ ai qua API, nên poll mới luôn bắt đầu từ 0 phiếu và không
 * có cách nào bê phiếu cũ sang bài mới. Cách duy nhất là tool tự nhớ: đọc hết người đã vote ở
 * poll cũ, cất vào `phieuCu`, rồi lúc đọc kết quả thì gộp hai bên. Người đã vote KHÔNG phải
 * vote lại, nhưng con số hiện trên bài poll mới ở Discord vẫn đếm từ 0 — đó là giới hạn của
 * Discord chứ không phải lỗi. Ai vote lại ở bài mới thì phiếu mới đè lên phiếu cũ (xem gopPhieu).
 *
 * Poll cũ bị ĐÓNG chứ không xoá: mỗi lúc chỉ nên có một chỗ vote, và bài cũ vẫn còn đó cho ai
 * muốn xem lại. Bài cũ đã bị xoá tay thì vẫn gửi lại được, dùng phiếu đã cất từ lần trước.
 */
router.post('/poll/:groupID/repost', async (req, res) => {
  const { groupID } = req.params;
  const pollType = req.query.type === 'gvg' ? 'gvg' : 'regular';
  const stateFile = pollType === 'gvg' ? `${groupID}/gvg-poll-state` : `${groupID}/poll-state`;
  const client = await getDiscordClient(groupID);
  if (!client || !client.isReady()) {
    return res.status(400).json({ error: 'Bot is not connected' });
  }

  try {
    const localData = loadDb();
    const pollState = localData.groups[groupID]?.polls?.[pollType] || null;
    if (!pollState) {
      return res.status(400).json({ error: 'Chưa có poll nào đang chạy để gửi lại.' });
    }

    // 1. Gom phiếu: phiếu đang có trên bài cũ + phiếu đã cất từ những lần gửi lại trước.
    let phieuCu: Phieu[] = Array.isArray(pollState.phieuCu) ? pollState.phieuCu : [];
    let mat = false;   // bài cũ còn hay đã bị xoá
    try {
      const kenhCu: any = await client.channels.fetch(pollState.channelId);
      const tinCu = await kenhCu.messages.fetch(pollState.messageId);
      if (tinCu?.poll) {
        phieuCu = gopPhieu(await docPhieu(tinCu), phieuCu);
        // Đóng bài cũ SAU KHI đã đọc xong phiếu.
        if (!tinCu.poll.resultsFinalized) await tinCu.poll.end().catch(() => {});
      }
    } catch (e: any) {
      // 10008 = tin nhắn không còn. Không sao: phiếu lần trước đã cất trong DB.
      if (e?.code !== 10008) console.error('[repost] Không đọc được poll cũ:', e?.message);
      mat = true;
    }

    // 2. Đăng bài mới. Mặc định đăng lại đúng kênh của bài cũ.
    const cauHinh = localData.groups[groupID]?.configs?.discord || {};
    const channelId = req.body?.channelId || pollState.channelId || cauHinh.pollChannelId || cauHinh.channelId;
    const kenh = await moKenhDangPoll(client, channelId);
    if (kenh.loi) return res.status(kenh.ma!).json({ error: kenh.loi });
    const { channel, tenKenh } = kenh as { channel: any; tenKenh: string };

    const pollAnswers = (pollState.answers || []).map((t: string) => ({ text: chuanTen(t) })).filter((a: any) => a.text);
    if (!pollAnswers.length) {
      return res.status(400).json({ error: 'Poll cũ không còn lựa chọn nào để dựng lại. Tạo poll mới.' });
    }

    const message: any = await guiPoll(channel, tenKenh, client, {
      question: { text: chuanTen(pollState.question) || 'Đăng ký tham gia' },
      answers: pollAnswers,
      allowMultiselect: pollState.allowMultiselect ?? Boolean(pollState.isGvg),
      duration: pollState.duration ?? 168,
    });

    // 3. Ghi lại trạng thái: bài mới, phiếu cũ mang theo, đếm số lần gửi lại.
    const moi = {
      ...pollState,
      messageId: message.id,
      channelId: message.channelId,
      guildId: message.guildId,
      guiLaiLuc: Date.now(),
      soLanGuiLai: (pollState.soLanGuiLai || 0) + 1,
      phieuCu,
    };
    localData.groups[groupID].polls![pollType] = moi;
    saveDb(localData);
    delete pollResultsCache[stateFile];

    res.json({ ...moi, baiCuDaMat: mat, soPhieuGiuLai: phieuCu.reduce((s, p) => s + (p.users?.length || 0), 0) });
  } catch (error: any) {
    res.status(error?.ma || 500).json({ error: error.message });
  }
});

router.post('/poll/:groupID/close', async (req, res) => {
  const { groupID } = req.params;
  const pollType = req.query.type === 'gvg' ? 'gvg' : 'regular';
  const stateFile = req.query.type === 'gvg' ? `${groupID}/gvg-poll-state` : `${groupID}/poll-state`;
  const client = await getDiscordClient(groupID);
  if (!client || !client.isReady()) {
    return res.status(400).json({ error: 'Bot is not connected' });
  }
  try {
    const localData = loadDb();
    const pollState = localData.groups[groupID]?.polls?.[pollType] || null;
    
    if (pollState) {
      try {
        const channel = await client.channels.fetch(pollState.channelId);
        if (channel && channel.isTextBased()) {
          try {
            const message = await channel.messages.fetch(pollState.messageId);
            if (message && message.poll && !message.poll.resultsFinalized) {
              await message.poll.end();
            }
          } catch (msgError: any) {
            if (msgError.code === 10008) {
              console.warn('Poll message not found on Discord, proceeding to clear local state.');
            } else {
              throw msgError;
            }
          }
        }
      } catch (discordError) {
        console.error('Error ending poll on Discord:', discordError);
      }
      
      if (req.query.type === 'gvg') {
        if (localData.groups[groupID] && localData.groups[groupID].polls && localData.groups[groupID].polls![pollType]) {
          localData.groups[groupID].polls![pollType].isClosed = true;
        }
      } else {
        if (localData.groups[groupID] && localData.groups[groupID].polls) {
          delete localData.groups[groupID].polls![pollType];
        }
      }
      saveDb(localData);
      
      delete pollResultsCache[stateFile];
    }
    res.json({ success: true });
  } catch (error: any) {
    if (req.query.type !== 'gvg') {
      const localData = loadDb();
      if (localData.groups[groupID] && localData.groups[groupID].polls) {
        delete localData.groups[groupID].polls![pollType];
        saveDb(localData);
      }
    }
    res.status(500).json({ error: error.message });
  }
});

router.get('/poll/results/:groupID', async (req, res) => {
  const { groupID } = req.params;
  const pollType = req.query.type === 'gvg' ? 'gvg' : 'regular';
  const stateFile = req.query.type === 'gvg' ? `${groupID}/gvg-poll-state` : `${groupID}/poll-state`;
  const client = await getDiscordClient(groupID);
  if (!client || !client.isReady()) {
    return res.status(400).json({ error: 'Bot is not connected' });
  }

  if (pollResultsCache[stateFile] && Date.now() - pollResultsCache[stateFile].timestamp < CACHE_TTL) {
    return res.json(pollResultsCache[stateFile].data);
  }

  try {
    const localData = loadDb();
    const pollState = localData.groups[groupID]?.polls?.[pollType] || null;
    
    if (!pollState) {
      return res.status(400).json({ error: 'Poll not found' });
    }
    
    // Phiếu gánh sang từ những bài poll trước (xem route /repost). Bài hiện tại đọc được thì
    // gộp thêm vào; bài đã bị xoá mà vẫn còn phiếu cất trong DB thì đọc mỗi phiếu cất — mất
    // bài poll không được phép làm mất luôn danh sách người đã đăng ký.
    const phieuCu: Phieu[] = Array.isArray(pollState.phieuCu) ? pollState.phieuCu : [];
    let phieu: Phieu[] = phieuCu;
    try {
      const channel: any = await client.channels.fetch(pollState.channelId);
      if (!channel || !channel.isTextBased()) throw new Error('Channel not found');
      const message = await channel.messages.fetch(pollState.messageId);
      if (!message || !message.poll) throw new Error('Poll not found');
      phieu = gopPhieu(await docPhieu(message), phieuCu);
    } catch (e: any) {
      if (!phieuCu.length) {
        return res.status(400).json({ error: e?.code === 10008 ? 'Poll not found' : (e?.message || 'Poll not found') });
      }
      console.warn('[poll results] Không đọc được bài poll, dùng phiếu đã cất:', e?.message);
    }

    const results: any = {
      continue: [] as any[],
      backup: [] as any[],
      options: [] as { text: string, users: any[] }[]
    };
    
    if (pollState.isGvg) {
      results.options = (pollState.answers || []).map((text: string) => ({
        text,
        users: [] as any[]
      }));
      
      for (const { text, users: userObjects } of phieu) {
        // So theo tên ĐÃ CHUẨN HOÁ. So chuỗi thô là lệch ngay khi có dấu cách thừa, và nhánh
        // "không khớp" bên dưới lại đẻ thêm một lựa chọn mới ở cuối, đúng chỗ mà giao diện
        // không bao giờ trỏ tới.
        const optIndex = results.options.findIndex((opt: any) => chuanTen(opt.text) === chuanTen(text));
        if (optIndex !== -1) {
          results.options[optIndex].users = userObjects;
        } else {
          results.options.push({ text, users: userObjects });
        }
      }
    } else {
      for (const { text, users: userObjects } of phieu) {
        // Bảng ánh xạ cũng khoá theo TÊN nên dính đúng bẫy dấu cách. Tra thẳng trước, trượt
        // thì dò lại theo tên đã chuẩn hoá.
        const bang = pollState.optionMappings || {};
        const mapping = bang[text]
          ?? Object.entries(bang).find(([k]) => chuanTen(k) === chuanTen(text))?.[1];
        if (mapping === 1) {
          results.continue.push(...userObjects);
        } else if (mapping === 2) {
          results.backup.push(...userObjects);
        }
      }
    }
    
    pollResultsCache[stateFile] = { data: results, timestamp: Date.now() };
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/discord/message/:groupID', async (req, res) => {
  const { groupID } = req.params;
  const { message, channelId: bodyChannelId } = req.body;

  const client = await getDiscordClient(groupID);
  if (!client || !client.isReady()) {
    return res.status(400).json({ error: 'Bot is not connected' });
  }

  try {
    const localData = loadDb();
    const data = localData.groups[groupID]?.configs?.discord || {};
    // Ưu tiên kênh CHỮ dành riêng cho poll. Trước đây rơi thẳng về data.channelId, mà đó là
    // kênh VOICE (tool bắt buộc voice để lấy danh sách thành viên) -> poll chui vào khung
    // chat của kênh voice, báo thành công mà không ai thấy.
    const channelId = bodyChannelId || data.pollChannelId || data.channelId;
    const channel = await client.channels.fetch(channelId);
    
    if (!channel || !channel.isTextBased()) {
      return res.status(400).json({ error: 'Channel does not support text messages' });
    }

    await (channel as any).send(message);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
