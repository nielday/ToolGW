import { ROLE_OPTIONS } from '../constants';
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { useTeamManager, useFilters, useModals } from '../controllers';
import { Member, DiscordConfig, VoiceChannel } from '../models';
import { isTowerArea, isPVPArea, normalizeDiscordName } from '../utils';
import { layPhien, luuPhien, xoaPhien } from '../lib/phien';
import { useTranslation } from 'react-i18next';
import {
  AppHeader,
  UnassignedSidebar,
  SetupManagement,
  AreaGrid,
  GlobalStatsPanel,
  FilterSearchModal,
  MemberStatsModal,
  TeamSettingsModal,
  DiscordConfigModal,
  AddMemberModal,
  MemberStatsOverviewModal,
  Login,
  Toast,
  ToastType,
  PublicView,
  MemberUpdate,
  TacticalBoardModal
} from '.';

export default function App() {
  const { t } = useTranslation();
  // Routing logic
  const path = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  const setupId = searchParams.get('id');
  const groupIdFromUrl = searchParams.get('group');

  // Auth State
  // Phải CÓ PHIÊN mới coi là đã đăng nhập. Trước đây chỉ nhìn cờ isLoggedIn trong
  // localStorage, mà cờ đó người dùng tự đặt được. Giờ không có phiên thì vào cũng chỉ thấy
  // màn hình trắng vì mọi lời gọi API đều bị chặn, thà đưa thẳng về màn đăng nhập.
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('isLoggedIn') === 'true' && !!layPhien();
  });
  // KHÔNG lấy nhóm từ thanh địa chỉ nữa. Trước đây ?group=<số> ghi đè nhóm đang đăng nhập,
  // đúng là lỗ "đổi số trên URL để xem nhóm khác". Máy chủ đã chặn rồi, nhưng để nguyên ở
  // đây thì giao diện vẫn đi đòi nhóm lạ và ăn 403 loạn xạ.
  // Trang xem công khai (/view) nhận nhóm riêng qua thuộc tính, không dùng chỗ này.
  const [userGroup, setUserGroup] = useState(() => {
    return localStorage.getItem('userGroup') || '';
  });
  const [username, setUsername] = useState(() => {
    return localStorage.getItem('username') || '';
  });
  const [userRole, setUserRole] = useState<number>(() => {
    return parseInt(localStorage.getItem('userRole') || '0', 10);
  });

  // Discord Connection State
  const [isConnected, setIsConnected] = useState(false);
  const [isInitialStatusChecked, setIsInitialStatusChecked] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [tacticalBoardSetup, setTacticalBoardSetup] = useState<{ id: string; name: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      const authenticate = async () => {
        try {
          const response = await fetch('/api/discord-auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
          });
          
          if (response.ok) {
            const data = await response.json();
            luuPhien(data.token || '');   // cất phiên trước, App gọi API ngay sau đây
            handleLogin(data.groupID, data.username, data.rule || 0);
            // Remove token from URL
            window.history.replaceState({}, document.title, window.location.pathname);
            setToast({ message: t('toasts.welcome', { username: data.username, groupId: data.groupID }), type: 'success' });
          } else if (!isLoggedIn) {
            const error = await response.json();
            setToast({ message: error.error || t('toasts.loginFailed'), type: 'error' });
          }
        } catch (error) {
          if (!isLoggedIn) {
            setToast({ message: t('toasts.connectionError'), type: 'error' });
          }
        }
      };
      authenticate();
    }
  }, [t]);

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  const teamManager = useTeamManager(isConnected, userGroup, username, showToast);
  const filters = useFilters();
  const modals = useModals();

  const handleLogin = (groupID: string, username: string, rule: number) => {
    setIsLoggedIn(true);
    setUserGroup(groupID);
    setUsername(username);
    setUserRole(rule);
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('userGroup', groupID);
    localStorage.setItem('username', username);
    localStorage.setItem('userRole', rule.toString());
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserGroup('');
    setUsername('');
    setUserRole(0);
    xoaPhien();   // xoá cả phiên lẫn mấy cờ cũ trong localStorage
  };

  const {
    areas,
    unassignedMembers,
    handleMoveMember,
    handleMoveTeam,
    handleAddToSelectedTeam,
    handleUpdateMember,
    handleSaveTeamSettings,
    selectedTeamId,
    setSelectedTeamId,
    refreshMembers,
    clearUnassignedMembers
  } = teamManager;

  const {
    isSearchActive,
    isGlobalFilterActive,
    searchQuery,
    selectedRoles,
    selectedWeapons,
    selectedRanks,
    selectedPositions,
    selectedParticipation,
    weaponSlotFilter,
    globalFilterRoles,
    globalFilterWeapons,
    globalFilterRanks,
    globalFilterPositions,
    globalFilterStatus,
    setGlobalFilterStatus,
    isUnassignedOnly,
    setIsUnassignedOnly,
    handleClearFilters,
    setIsFilterOpen,
    handleSearch,
    setGlobalFilterRoles,
    setGlobalFilterWeapons,
    setGlobalFilterRanks,
    setGlobalFilterPositions,
    setWeaponSlotFilter
  } = filters;

  // Render Public View if on /view path
  if (path === '/view' && setupId) {
    return <PublicView setupId={setupId} groupId={groupIdFromUrl || '1'} />;
  }

  if (path === '/update') {
    return <MemberUpdate />;
  }

  const {
    selectedMemberId,
    setSelectedMemberId,
    setSelectedMember,
    isSidebarOpen,
    setIsSidebarOpen,
    isDiscordModalOpen,
    setIsDiscordModalOpen,
    isAddMemberModalOpen,
    setIsAddMemberModalOpen
  } = modals;

  // Nguồn đang xem, giữ trong ref vì checkStatus bị vòng poll giữ lại từ lần render đầu
  // (useEffect chỉ phụ thuộc [isLoggedIn]) nên đọc thẳng teamManager.memberSource ở trong
  // đó là đọc phải giá trị cũ.
  const nguonDangXem = useRef(teamManager.memberSource);
  useEffect(() => { nguonDangXem.current = teamManager.memberSource; }, [teamManager.memberSource]);

  const checkStatus = async () => {
    if (!isLoggedIn || !userGroup) return;
    try {
      const res = await fetch(`/api/status/${userGroup}`);
      if (!res.ok) return;
      
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) return;

      const data = await res.json();
      const newConnected = data.connected;
      
      setIsConnected(prev => {
        // Bot rớt kết nối thì chỉ xoá danh sách khi nó ĐANG lấy từ Discord. Nguồn "Thành
        // viên" nằm trong DB của tool, bot sống hay chết cũng không liên quan; xoá nó đi là
        // Railway khởi động lại một cái người dùng thấy trống trơn mà không hiểu vì sao.
        if (prev && !newConnected && nguonDangXem.current !== 'custom') {
          clearUnassignedMembers();
        }
        return newConnected;
      });
      setIsInitialStatusChecked(true);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.debug('Background status check failed');
      }
    }
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    let isMounted = true;
    let timeoutId: any;

    const poll = async () => {
      await checkStatus();
      if (isMounted) {
        timeoutId = setTimeout(poll, 10000);
      }
    };

    poll();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [isLoggedIn]);

  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [discordConfig, setDiscordConfig] = useState<DiscordConfig | null>(null);

  const fetchDiscordConfig = () => {
    if (userGroup) {
      fetch(`/api/bot-config/${userGroup}`)
        .then(res => res.json())
        .then(data => {
          setDiscordConfig(data);
          if (data.channelId) {
            setSelectedChannelId(data.channelId);
          }
        })
        .catch(err => console.error('Failed to load discord config:', err));
    }
  };

  useEffect(() => {
    fetchDiscordConfig();
  }, [userGroup]);

  // TỰ NẠP danh sách thành viên khi mở trang.
  // Trước đây không có chỗ nào gọi refreshMembers lúc khởi động: nó chỉ chạy khi bấm nút
  // refresh, khi đổi nguồn, hoặc sau khi thêm người. Nên vào trang là "Danh sách trống",
  // ai cũng tưởng dữ liệu bay mất.
  // ÉP nguồn 'custom' (Thành viên) chứ không dùng memberSource đang có: nguồn voice đòi một
  // kênh voice, tự gọi nó lúc mở trang là bắn toast lỗi vào mặt người không dùng voice.
  // Đổi sang voice thì ô chọn nguồn tự gọi refresh, không cần lo ở đây.
  const daNapDanhSach = useRef('');
  useEffect(() => {
    if (!isLoggedIn || !userGroup) return;
    if (daNapDanhSach.current === userGroup) return;   // mỗi nhóm chỉ tự nạp một lần
    daNapDanhSach.current = userGroup;
    teamManager.setMemberSource('custom');
    refreshMembers('custom');
  }, [isLoggedIn, userGroup]);

  const handleConnect = async () => {
    if (!userGroup) return;
    setIsConnecting(true);
    try {
      // If connecting, we only want to update the channelId on the server
      if (!isConnected && selectedChannelId) {
        await fetch(`/api/bot-config/${userGroup}/channel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId: selectedChannelId })
        });
        
        // Update local config state if it exists
        if (discordConfig) {
          setDiscordConfig({ ...discordConfig, channelId: selectedChannelId });
        }
      }

      const endpoint = isConnected ? `/api/disconnect/${userGroup}` : `/api/connect/${userGroup}`;
      const res = await fetch(endpoint, { method: 'POST' });
      if (res.ok) {
        if (isConnected && teamManager.memberSource !== 'custom') {
          clearUnassignedMembers();
        }
        setIsConnected(!isConnected);
        // Server có thể kết nối THÀNH CÔNG mà vẫn có điều cần nói (chưa chọn kênh, kênh
        // không phải voice...). Không đọc ra là cảnh báo bị nuốt, người dùng tưởng mọi thứ
        // ổn rồi sau đó ngồi thắc mắc vì sao danh sách trống.
        const kq = await res.json().catch(() => ({} as any));
        if (kq?.canhBao) showToast(kq.canhBao, 'info');
      } else {
        const data = await res.json();
        showToast(data.error || t('toasts.actionFailed'), 'error');
      }
    } catch (err) {
      console.error('Failed to toggle connection:', err);
      showToast(t('toasts.connectionError'), 'error');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRefresh = async (source?: 'discord' | 'custom' | 'poll' | 'gvg', gvgIndex?: number, channelId?: string | string[]) => {
    const currentSource = source || teamManager.memberSource;
    if (currentSource === 'discord' && !isConnected) {
      showToast(t('toasts.connectBotFirst'), 'error');
      return;
    }
    // Bỏ tick hết kênh thì nói thẳng, đừng lặng lẽ rơi về ô chọn kênh trên thanh tiêu đề:
    // ô đó thường trỏ vào kênh CHỮ, gọi vào là ra lỗi "không phải kênh voice" chẳng ăn nhập
    // gì với việc vừa bỏ tick.
    if (currentSource === 'discord' && voiceChannels.length > 0 && voiceChon.length === 0) {
      showToast(t('sidebar.voice.needPick'), 'error');
      return;
    }
    setIsRefreshing(true);
    try {
      // Ưu tiên danh sách kênh voice đã tick. Chưa tick cái nào thì mới rơi về ô chọn kênh
      // trên thanh tiêu đề, để người chưa dùng tính năng này không thấy khác gì.
      //
      // NHƯNG chỉ rơi về khi ô đó ĐÚNG LÀ kênh voice. Ô trên thanh tiêu đề hay trỏ vào kênh
      // chữ (Bang Chiến, tám tám...), đưa nó vào đây là chắc chắn lỗi "kênh chữ, không phải
      // kênh voice" dù người dùng chẳng làm gì sai. Không có kênh voice nào thì gửi danh
      // sách rỗng, để nguồn bình chọn tự lấy người từ bảng bình chọn.
      const laKenhVoice = (id: string) => voiceChannels.some((c) => c.id === id);
      const kenh = channelId ?? (voiceChon.length
        ? voiceChon
        : (selectedChannelId && laKenhVoice(selectedChannelId) ? [selectedChannelId] : []));
      await refreshMembers(source, gvgIndex, kenh, chiThanhVien);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Dọn bản ghi trùng người. XOÁ THẬT nên phải hỏi trước, và nói rõ nó làm gì: gộp, không
  // phải vứt bớt. Người dùng sợ mất dữ liệu là đúng, nên câu hỏi phải trả lời được nỗi sợ đó.
  const handleDonTrung = async () => {
    if (!userGroup) return;
    if (!window.confirm(t('sidebar.dedupe.confirm'))) return;
    try {
      const res = await fetch(`/api/custom-members/${userGroup}/don-trung`, { method: 'POST' });
      const kq = await res.json();
      if (!res.ok) return showToast(kq.error || t('sidebar.dedupe.error'), 'error');
      if (!kq.soNguoi) return showToast(t('sidebar.dedupe.none'), 'info');
      showToast(t('sidebar.dedupe.done', { n: kq.soNguoi, x: kq.soBanXoa }), 'success');
      handleRefresh('custom');
    } catch {
      showToast(t('sidebar.dedupe.error'), 'error');
    }
  };

  // ===== Nguồn danh sách theo NHIỀU kênh voice =====
  // Bang chiến chia sẵn voice công và voice thủ, mà nguồn cũ đọc đúng một kênh nên với kiểu
  // chia đó nó vốn không dùng được.
  const [voiceChannels, setVoiceChannels] = useState<VoiceChannel[]>([]);
  const [voiceLoi, setVoiceLoi] = useState('');
  const [voiceChon, setVoiceChon] = useState<string[]>([]);
  const [voiceGan, setVoiceGan] = useState<Record<string, string>>({});
  // Mặc định BẬT. Kênh voice trả về cả người tạt vào nghe chơi, mà mặc định hợp lý là danh
  // sách xếp trận chỉ gồm người trong bang.
  const [chiThanhVien, setChiThanhVien] = useState(true);

  useEffect(() => {
    const vn = discordConfig?.voiceNguon;
    if (!vn) return;
    setVoiceChon(vn.chon || []);
    setVoiceGan(vn.gan || {});
    setChiThanhVien(vn.chiThanhVien !== false);
  }, [discordConfig]);

  // ĐIỂM DANH: ai đang ở kênh voice nào, cho cả server.
  // Đọc từ bộ nhớ bot chứ không gọi API Discord, nên hỏi 15 giây một lần cũng không tốn gì.
  // Chỉ chạy khi bot đang kết nối, và dừng hẳn khi rớt để không đập vào một endpoint chắc
  // chắn trả rỗng.
  const [voiceState, setVoiceState] = useState<Record<string, { id: string; name: string }>>({});

  useEffect(() => {
    if (!isConnected || !userGroup) return;
    let song = true;
    const nap = async () => {
      try {
        const res = await fetch(`/api/voice-state/${userGroup}`);
        const kq = await res.json();
        if (song) setVoiceState(kq.states || {});
      } catch { /* mất mạng một nhịp thì giữ số cũ, đừng xoá trắng bảng điểm danh */ }
    };
    nap();
    const id = setInterval(nap, 15000);
    return () => { song = false; clearInterval(id); };
  }, [isConnected, userGroup]);

  // Tên kênh để hiện "đang ở kênh nào" và để đoán khu khi chưa gán.
  const tenKenhVoice = useMemo(
    () => Object.fromEntries(voiceChannels.map((c) => [c.id, c.name])),
    [voiceChannels],
  );

  const napKenhVoice = async () => {
    if (!userGroup) return;
    try {
      const res = await fetch(`/api/voice-channels/${userGroup}`);
      const kq = await res.json();
      const ds = kq.channels || [];
      setVoiceChannels(ds);
      setVoiceLoi(kq.error || '');
    } catch {
      setVoiceLoi(t('sidebar.voice.loadError'));
    }
  };

  // DỌN KÊNH ĐÃ TICK MÀ KHÔNG CÒN.
  // Lựa chọn tick nằm trong DB và sống mãi, nên kênh bị xoá hay bot mất quyền xem thì cái
  // tick vẫn ở đó, và mọi lượt nạp danh sách sau này đều báo lỗi "không mở được kênh ID ...".
  // Người dùng nhìn vào không hiểu id đó ở đâu ra, vì nó không hề nằm trong Cấu hình Discord.
  //
  // Để riêng một effect chứ không dọn ngay trong lúc nạp: danh sách kênh và lựa chọn đã tick
  // về từ hai lời gọi khác nhau, cái nào tới trước không biết, dọn trong lúc nạp là dễ dọn
  // lúc lựa chọn còn chưa kịp nạp.
  //
  // CHỈ dọn khi hỏi được danh sách VÀ danh sách không rỗng. Bot rớt mạng là danh sách rỗng,
  // dọn lúc đó là xoá trắng lựa chọn của người ta.
  useEffect(() => {
    if (voiceLoi || !voiceChannels.length || !voiceChon.length) return;
    const con = new Set(voiceChannels.map((c) => c.id));
    const chonMoi = voiceChon.filter((id) => con.has(id));
    if (chonMoi.length === voiceChon.length) return;
    const ganMoi: Record<string, string> = {};
    for (const id of Object.keys(voiceGan)) if (con.has(id)) ganMoi[id] = voiceGan[id];
    showToast(t('sidebar.voice.pruned', { n: voiceChon.length - chonMoi.length }), 'info');
    luuNguonVoice(chonMoi, ganMoi);
  }, [voiceChannels, voiceChon, voiceLoi]);

  // Bot lên rồi mới hỏi được danh sách kênh. Số người trong kênh đổi liên tục nên nạp lại
  // mỗi lần bot đổi trạng thái, còn lại để người dùng chủ động bấm làm mới.
  useEffect(() => { if (isConnected) napKenhVoice(); }, [isConnected, userGroup]);

  const luuNguonVoice = async (chon: string[], gan: Record<string, string>, chiTv = chiThanhVien) => {
    setVoiceChon(chon);
    setVoiceGan(gan);
    setChiThanhVien(chiTv);
    if (!userGroup) return;
    try {
      await fetch(`/api/bot-config/${userGroup}/voice-nguon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chon, gan, chiThanhVien: chiTv }),
      });
    } catch (e) {
      console.error('Không lưu được nguồn voice:', e);
    }
  };

  const handleXepTheoVoice = () => {
    const soGan = Object.keys(voiceGan).filter((k) => voiceGan[k]).length;
    if (!soGan) return showToast(t('sidebar.voice.needMap'), 'error');
    const kq = teamManager.handleXepTheoVoice(voiceGan);
    if (!kq.daThem) {
      // Ba lý do khác hẳn nhau, mỗi cái sửa một kiểu. Gộp chung một câu là người dùng đi
      // sửa nhầm chỗ: danh sách rỗng thì phải đi gọi người vào voice, chứ không phải ngồi
      // xem lại phần gán khu.
      if (!kq.tongCho) return showToast(t('sidebar.voice.emptyList'), 'error');
      if (kq.daTrongDoi === kq.tongCho) return showToast(t('sidebar.voice.nothing'), 'info');
      return showToast(t('sidebar.voice.allSkipped', { n: kq.boQua }), 'info');
    }
    // Nói luôn số người BỎ QUA. Xếp xong mà thiếu người thì phải biết ngay là thiếu ai chứ
    // không phải ngồi đếm lại từng đội.
    showToast(
      t('sidebar.voice.arranged', { n: kq.daThem, k: kq.soKhu })
        + (kq.boQua ? ` ${t('sidebar.voice.skipped', { n: kq.boQua })}` : '')
        + (kq.khach ? ` ${t('sidebar.voice.skippedGuestsArrange', { n: kq.khach })}` : ''),
      'success',
    );
  };

  const handleChannelChange = async (id: string) => {
    setSelectedChannelId(id);
    
    // Update local config state if it exists
    if (discordConfig) {
      setDiscordConfig({ ...discordConfig, channelId: id });
    }

    // Persist to server if we have a group
    if (userGroup) {
      try {
        await fetch(`/api/bot-config/${userGroup}/channel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId: id })
        });
      } catch (err) {
        console.error('Failed to update channel on server:', err);
      }
    }
  };

  const normalizeString = (str: string | undefined | null) => {
    if (!str) return '';
    return normalizeDiscordName(str)
      .normalize('NFKD') // Decompose fancy fonts and diacritics
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .toLowerCase()
      .replace(/[đĐ]/g, 'd')
      .replace(/[^a-z0-9\s]/g, '') // Remove non-latin/non-alphanumeric characters (keeps spaces)
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .trim();
  };

  const isMemberMatching = (m: Member) => {
    if (!isSearchActive) return true;
    
    // Search by name, ingame name, or position: case-insensitive, partial match, normalized for Vietnamese accents
    const normalizedQuery = normalizeString(searchQuery);
    const normalizedName = normalizeString(m.name);
    const normalizedIngameName = normalizeString(m.ingameName);
    const normalizedPosition = normalizeString(m.position);
    const matchesSearch = normalizedQuery === '' || 
      normalizedName.includes(normalizedQuery) || 
      normalizedIngameName.includes(normalizedQuery) ||
      normalizedPosition.includes(normalizedQuery);
    
    // Role filter: Check if the custom role string matches any of the selected role names
    const matchesRole = selectedRoles.length === 0 || 
      selectedRoles.includes(m.role);

    const matchesWeapon = selectedWeapons.length === 0 || (() => {
      const hasPrimary1 = m.primaryWeapon1?.id && m.primaryWeapon1.id !== 'w0';
      const hasPrimary2 = m.primaryWeapon2?.id && m.primaryWeapon2.id !== 'w0';
      const hasNoWeapon = !hasPrimary1 && !hasPrimary2;
      
      if (selectedWeapons.includes('w0') && hasNoWeapon) return true;
      
      const mWeapons: string[] = [];
      if (weaponSlotFilter.primary) {
        if (hasPrimary1) mWeapons.push(m.primaryWeapon1.id);
        if (hasPrimary2) mWeapons.push(m.primaryWeapon2.id);
      }
      if (weaponSlotFilter.secondary) {
        m.secondaryWeapons.forEach(sw => {
          if (sw.id && sw.id !== 'w0') mWeapons.push(sw.id);
        });
      }
      return selectedWeapons.some(id => mWeapons.includes(id));
    })();

    const matchesRank = selectedRanks.length === 0 ||
      (m.rank && selectedRanks.includes(m.rank.id));
    
    const matchesPosition = selectedPositions.length === 0 ||
      (m.position && selectedPositions.some(posId => {
        const normalizedPos = normalizeString(m.position);
        if (posId === 'pos_cong') return normalizedPos === 'cong' || normalizedPos === 'poscong';
        if (posId === 'pos_thu') return normalizedPos === 'thu' || normalizedPos === 'posthu';
        if (posId === 'pos_flex') return normalizedPos === 'flex' || normalizedPos === 'posflex';
        return false;
      }));

    const matchesParticipation = selectedParticipation.length === 0 ||
      (m.participationStatus && selectedParticipation.includes(m.participationStatus));
      
    const isAssigned = memberTeamMap.has(m.id);
    const matchesUnassigned = !isUnassignedOnly || !isAssigned;
      
    return matchesSearch && matchesRole && matchesWeapon && matchesRank && matchesPosition && matchesParticipation && matchesUnassigned;
  };

  const isMemberMatchingGlobal = (m: Member) => {
    const matchesGlobalRole = globalFilterRoles.length === 0 || 
      globalFilterRoles.includes(m.role);

    const matchesGlobalWeapon = globalFilterWeapons.length === 0 || (() => {
      const hasPrimary1 = m.primaryWeapon1?.id && m.primaryWeapon1.id !== 'w0';
      const hasPrimary2 = m.primaryWeapon2?.id && m.primaryWeapon2.id !== 'w0';
      const hasNoWeapon = !hasPrimary1 && !hasPrimary2;
      
      if (globalFilterWeapons.includes('w0') && hasNoWeapon) return true;
      
      const mWeapons: string[] = [];
      if (weaponSlotFilter.primary) {
        if (hasPrimary1) mWeapons.push(m.primaryWeapon1.id);
        if (hasPrimary2) mWeapons.push(m.primaryWeapon2.id);
      }
      if (weaponSlotFilter.secondary) {
        m.secondaryWeapons.forEach(sw => {
          if (sw.id && sw.id !== 'w0') mWeapons.push(sw.id);
        });
      }
      return globalFilterWeapons.some(id => mWeapons.includes(id));
    })();

    const matchesGlobalRank = globalFilterRanks.length === 0 ||
      (m.rank && globalFilterRanks.includes(m.rank.id));
    const matchesGlobalPosition = globalFilterPositions.length === 0 ||
      (m.position && globalFilterPositions.some(posId => {
        const normalizedPos = normalizeString(m.position);
        if (posId === 'pos_cong') return normalizedPos === 'cong' || normalizedPos === 'poscong';
        if (posId === 'pos_thu') return normalizedPos === 'thu' || normalizedPos === 'posthu';
        if (posId === 'pos_flex') return normalizedPos === 'flex' || normalizedPos === 'posflex';
        return false;
      }));
      
    const memberStatus = m.status === 'in-game' ? 'online' : (m.status || 'offline');
    const matchesGlobalStatus = filters.globalFilterStatus.length === 0 ||
      filters.globalFilterStatus.includes(memberStatus);

    return matchesGlobalRole && matchesGlobalWeapon && matchesGlobalRank && matchesGlobalPosition && matchesGlobalStatus;
  };

  const memberTeamMap = useMemo(() => {
    const map = new Map<string, { teamId: string, teamName: string, areaName: string }>();
    
    areas.forEach(area => {
      const isSpecial = isTowerArea(area.name) || isPVPArea(area.name);
      area.teams.forEach(team => {
        team.members.forEach(m => {
          const existing = map.get(m.id);
          // Prioritize Normal team over Special team for display in sidebar
          if (!existing || (!isSpecial && (isTowerArea(existing.areaName) || isPVPArea(existing.areaName)))) {
            map.set(m.id, { teamId: team.id, teamName: team.name, areaName: area.name });
          }
        });
      });
    });
    return map;
  }, [areas]);

  const memberAllTeamIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    areas.forEach(area => {
      area.teams.forEach(team => {
        team.members.forEach(m => {
          if (!map.has(m.id)) {
            map.set(m.id, new Set());
          }
          map.get(m.id)!.add(team.id);
        });
      });
    });
    return map;
  }, [areas]);

  const totalAssignedMembers = useMemo(() => {
    const uniqueIds = new Set<string>();
    areas.forEach(area => {
      area.teams.forEach(team => {
        team.members.forEach(m => uniqueIds.add(m.id));
      });
    });
    return uniqueIds.size;
  }, [areas]);

  const filteredUnassignedByStatus = useMemo(() => {
    return unassignedMembers.filter(m => m.status === 'online');
  }, [unassignedMembers]);

  const totalMatchingUnassigned = useMemo(() => 
    filteredUnassignedByStatus.filter(m => isMemberMatching(m) && isMemberMatchingGlobal(m)).length
  , [filteredUnassignedByStatus, isMemberMatching, isMemberMatchingGlobal]);

  const totalMatchingMembers = useMemo(() => {
    const uniqueMatchingIds = new Set<string>();
    
    // Count unassigned matching members
    filteredUnassignedByStatus.forEach(m => {
      if (isMemberMatching(m) && isMemberMatchingGlobal(m)) {
        uniqueMatchingIds.add(m.id);
      }
    });

    // Count assigned matching members
    areas.forEach(area => {
      area.teams.forEach(team => {
        team.members.forEach(m => {
          if (isMemberMatching(m) && isMemberMatchingGlobal(m)) {
            uniqueMatchingIds.add(m.id);
          }
        });
      });
    });

    return uniqueMatchingIds.size;
  }, [areas, filteredUnassignedByStatus, isMemberMatching, isMemberMatchingGlobal]);

  const sortedUnassigned = useMemo(() => {
    return [...filteredUnassignedByStatus].sort((a, b) => {
      const aBackup = a.participationStatus === 'backup';
      const bBackup = b.participationStatus === 'backup';
      if (!aBackup && bBackup) return -1;
      if (aBackup && !bBackup) return 1;

      if (isSearchActive) {
        const aMatch = isMemberMatching(a);
        const bMatch = isMemberMatching(b);
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
      }

      return 0;
    });
  }, [filteredUnassignedByStatus, isSearchActive, isMemberMatching]);

  const selectedTeamIdArea = teamManager.areas.find(a => a.teams.some(t => t.id === selectedTeamId));
  const isSelectedTeamIdSpecial = selectedTeamIdArea ? (selectedTeamIdArea.name.toLowerCase().includes('pvp') || selectedTeamIdArea.name.toLowerCase().includes('trụ')) : false;

  const handleCreateNewSetupWithExpand = () => {
    teamManager.handleCreateNewSetup();
    filters.setForceExpandAll(true);
    setTimeout(() => {
      filters.setForceExpandAll(undefined);
    }, 100);
  };

  const handleLoadSetupWithExpand = async (setup: any) => {
    await teamManager.handleLoadSetup(setup);
    filters.setForceExpandAll(true);
    setTimeout(() => {
      filters.setForceExpandAll(undefined);
    }, 100);
  };

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  const handleOpenStatsModal = (members: Member[], title: string | null = null) => {
    modals.setStatsModalMembers(members);
    modals.setStatsModalTitle(title);
    modals.setIsStatsModalOpen(true);
  };

  // Đăng đội hình ra Discord.
  // FRONTEND dịch chữ ở đây (t() nằm sẵn, biết đang hiển thị gì), BACKEND chỉ lo bố cục và
  // cắt tin theo trần 2000 ký tự. Để backend tự dịch thì phải chép cả bảng i18n sang, hai
  // bên lệch nhau lúc nào không hay.
  const handlePostLineup = async () => {
    // Tiêu đề lấy TÊN BÀI XẾP, không lấy nhãn nút. "Đăng đội hình" là câu lệnh bấm, đọc lên
    // như tiêu đề thì vô nghĩa. Bài chưa đặt tên thì mới dùng nhãn mặc định.
    const tenBai = (teamManager.currentSetupName || '').trim();
    const chuaDatTen = !tenBai || tenBai === t('setup.newSetup');
    const payload = {
      groupID: userGroup,
      channelId: selectedChannelId || undefined,
      title: chuaDatTen ? t('header.postLineupTitle') : tenBai,
      nguoiXep: username,        // để bot hiện "xếp bởi ai" khi gõ /doihinh
      areas: areas.map((area) => ({
        name: area.name,
        teams: (area.teams || []).map((team) => ({
          name: team.name,
          members: (team.members || []).map((m) => ({
            name: m.name,
            // Để backend gắn mention mở hồ sơ Discord. Ưu tiên discordId; `id` chỉ dùng khi
            // thiếu, vì người thêm tay lúc bot chưa tra ra được mang id 'custom_<thời điểm>'.
            // Không tìm ra id thật thì backend để nguyên chữ thường.
            discordId: m.discordId || m.id,
            ingameName: m.ingameName,
            roleIcon: ROLE_OPTIONS.find((r) => r.id === m.role)?.icon,
            // Vũ khí lưu dạng khoá i18n ('weapons.strategicSword') nên phải dịch trước khi gửi.
            weapon: m.primaryWeapon1?.name ? t(m.primaryWeapon1.name) : undefined,
            isBackup: m.participationStatus === 'backup',
          })),
        })),
      })),
    };
    const res = await fetch('/api/post-lineup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      // Ném nguyên câu lỗi của server: mỗi nguyên nhân cần một cách sửa khác nhau.
      const loi = await res.json().catch(() => ({}));
      throw new Error(loi.error || t('header.postLineupError'));
    }
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#313338] font-sans text-[#DBDEE1]">
      <AppHeader
        onPostLineup={handlePostLineup}
        totalAssignedMembers={totalAssignedMembers} 
        totalMembers={filteredUnassignedByStatus.length} 
        onConfirmAllAssigned={teamManager.handleConfirmAllAssigned}
        isConnected={isConnected}
        isInitialStatusChecked={isInitialStatusChecked}
        isConnecting={isConnecting}
        onConnect={handleConnect}
        onOpenDiscordConfig={() => {
          setIsLoadingConfig(true);
          setIsDiscordModalOpen(true);
          setTimeout(() => setIsLoadingConfig(false), 500);
        }}
        isLoadingConfig={isLoadingConfig}
        discordChannels={discordConfig?.channels || []}
        selectedChannelId={selectedChannelId}
        onChannelChange={handleChannelChange}
        username={username}
        userGroup={userGroup}
        userRole={userRole}
        onLogout={handleLogout}
        activePoll={teamManager.activePoll}
        activeGvgPoll={teamManager.activeGvgPoll}
        handleCreatePoll={(data) => teamManager.handleCreatePoll({ ...data, channelId: selectedChannelId })}
        handleCreateGvGPoll={(data) => teamManager.handleCreateGvGPoll({ ...data, channelId: selectedChannelId })}
        handleClosePoll={teamManager.handleClosePoll}
        handleCloseGvgPoll={teamManager.handleCloseGvgPoll}
        handleRepostPoll={teamManager.handleRepostPoll}
        showToast={showToast}
      />

      <div className="z-20 flex flex-1 overflow-hidden relative p-6">
        <UnassignedSidebar 
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          isSearchActive={isSearchActive}
          isGlobalFilterActive={isGlobalFilterActive}
          totalMatchingUnassigned={totalMatchingUnassigned}
          filteredUnassignedByStatus={filteredUnassignedByStatus}
          sortedUnassigned={sortedUnassigned}
          selectedMemberId={selectedMemberId}
          isMemberMatching={isMemberMatching}
          isMemberMatchingGlobal={isMemberMatchingGlobal}
          memberTeamMap={memberTeamMap}
          memberAllTeamIds={memberAllTeamIds}
          setSelectedMemberId={setSelectedMemberId}
          setSelectedMember={setSelectedMember}
          selectedTeamId={selectedTeamId}
          handleAddToSelectedTeam={handleAddToSelectedTeam}
          handleMoveMember={handleMoveMember}
          handleMoveTeam={handleMoveTeam}
          handleRemoveFromTeam={teamManager.handleRemoveFromTeam}
          isConnected={isConnected}
          isRefreshing={isRefreshing}
          onRefreshMembers={handleRefresh}
          onOpenFilter={() => filters.setIsFilterOpen(true)}
          onClearFilters={handleClearFilters}
          memberSource={teamManager.memberSource}
          lastRefreshedSource={teamManager.lastRefreshedSource}
          setMemberSource={teamManager.setMemberSource}
          onAddMember={() => setIsAddMemberModalOpen(true)}
          onDeleteCustomMember={teamManager.handleDeleteCustomMember}
          activePoll={teamManager.activePoll}
          isSelectedTeamSpecial={isSelectedTeamIdSpecial}
          gvgPollOptions={teamManager.gvgPollOptions}
          gvgOptionIndex={teamManager.gvgOptionIndex}
          setGvgOptionIndex={teamManager.setGvgOptionIndex}
          isInitialStatusChecked={isInitialStatusChecked}
          voiceChannels={voiceChannels}
          voiceLoi={voiceLoi}
          voiceChon={voiceChon}
          voiceGan={voiceGan}
          chiThanhVien={chiThanhVien}
          areaOptions={areas.map((a) => ({ id: a.id, name: a.name }))}
          onVoiceChange={luuNguonVoice}
          onReloadVoice={napKenhVoice}
          onXepTheoVoice={handleXepTheoVoice}
          onDonTrung={handleDonTrung}
          isStatsModalOpen={modals.isStatsModalOpen}
          setIsStatsModalOpen={(open) => {
            if (open) {
              handleOpenStatsModal(sortedUnassigned, t('stats.memberStats'));
            } else {
              modals.setIsStatsModalOpen(false);
            }
          }}
        />

        <div className="flex-1 flex flex-col gap-6 min-w-0 overflow-hidden">
          <SetupManagement 
            currentSetupName={teamManager.currentSetupName}
            setCurrentSetupName={teamManager.setCurrentSetupName}
            isEditingSetupName={modals.isEditingSetupName}
            setIsEditingSetupName={modals.setIsEditingSetupName}
            tempSetupName={modals.tempSetupName}
            setTempSetupName={modals.setTempSetupName}
            handleCreateNewSetup={handleCreateNewSetupWithExpand}
            handleConfirmSave={teamManager.handleConfirmSave}
            isSetupDropdownOpen={teamManager.isSetupDropdownOpen}
            setIsSetupDropdownOpen={teamManager.setIsSetupDropdownOpen}
            savedSetups={teamManager.savedSetups}
            handleLoadSetup={handleLoadSetupWithExpand}
            handleDeleteSetup={teamManager.handleDeleteSetup}
            handleCopySetup={teamManager.handleCopySetup}
            handleCheckOnline={teamManager.handleCheckOnline}
            isCheckingOnline={teamManager.isCheckingOnline}
            onConfirmMatchResult={teamManager.handleConfirmMatchResult}
            isConnected={isConnected}
            areas={areas}
            showToast={showToast}
            currentSetupId={teamManager.currentSetupId}
            groupId={userGroup}
            selectedChannelId={selectedChannelId}
            onOpenTacticalBoard={(id, name) => setTacticalBoardSetup({ id, name })}
          />

          <div className="custom-scrollbar flex-1 overflow-y-auto bg-[#313338] flex flex-col gap-6 pr-2">          
            <GlobalStatsPanel 
              areas={areas}
              globalFilterRoles={globalFilterRoles}
              setGlobalFilterRoles={filters.setGlobalFilterRoles}
              globalFilterWeapons={globalFilterWeapons}
              setGlobalFilterWeapons={filters.setGlobalFilterWeapons}
              globalFilterRanks={globalFilterRanks}
              setGlobalFilterRanks={filters.setGlobalFilterRanks}
              globalFilterPositions={globalFilterPositions}
              setGlobalFilterPositions={filters.setGlobalFilterPositions}
              globalFilterStatus={filters.globalFilterStatus}
              setGlobalFilterStatus={filters.setGlobalFilterStatus}
              weaponSlotFilter={weaponSlotFilter}
              setWeaponSlotFilter={filters.setWeaponSlotFilter}
            />

            <AreaGrid
              areas={areas}
              voiceState={voiceState}
              voiceGan={voiceGan}
              tenKenhVoice={tenKenhVoice}
              isSearchActive={isSearchActive}
              isGlobalFilterActive={isGlobalFilterActive}
              isMemberMatching={isMemberMatching}
              isMemberMatchingGlobal={isMemberMatchingGlobal}
              forceExpandAll={filters.forceExpandAll}
              editingAreaId={modals.editingAreaId}
              setEditingAreaId={modals.setEditingAreaId}
              tempAreaName={modals.tempAreaName}
              setTempAreaName={modals.setTempAreaName}
              handleRenameArea={teamManager.handleRenameArea}
              handleAddTeam={teamManager.handleAddTeam}
              handleClearAreaMembers={teamManager.handleClearAreaMembers}
              handleDeleteArea={teamManager.handleDeleteArea}
              handleMoveMember={handleMoveMember}
              handleMoveTeam={handleMoveTeam}
              handleRenameTeam={teamManager.handleRenameTeam}
              handleDeleteTeam={teamManager.handleDeleteTeam}
              setSettingsTeam={modals.setSettingsTeam}
              handleClearTeamMembers={teamManager.handleClearTeamMembers}
              selectedTeamId={selectedTeamId}
              setSelectedTeamId={setSelectedTeamId}
              selectedMemberId={selectedMemberId}
              setSelectedMemberId={setSelectedMemberId}
              setSelectedMember={setSelectedMember}
              handleRemoveFromTeam={teamManager.handleRemoveFromTeam}
              handleAddArea={teamManager.handleAddArea}
              onOpenStatsModal={handleOpenStatsModal}
              memberSource={teamManager.memberSource}
              onDeleteCustomMember={teamManager.handleDeleteCustomMember}
              globalFilterRoles={filters.globalFilterRoles}
              setGlobalFilterRoles={filters.setGlobalFilterRoles}
              globalFilterWeapons={filters.globalFilterWeapons}
              setGlobalFilterWeapons={filters.setGlobalFilterWeapons}
              globalFilterRanks={filters.globalFilterRanks}
              setGlobalFilterRanks={filters.setGlobalFilterRanks}
              weaponSlotFilter={weaponSlotFilter}
              setWeaponSlotFilter={filters.setWeaponSlotFilter}
            />
          </div>
        </div>
      </div>

      <FilterSearchModal 
        isFilterOpen={filters.isFilterOpen}
        setIsFilterOpen={filters.setIsFilterOpen}
        isSearchActive={isSearchActive}
        totalMatchingMembers={totalMatchingMembers}
        handleClearFilters={handleClearFilters}
        searchQuery={filters.searchQuery}
        setSearchQuery={filters.setSearchQuery}
        handleSearch={handleSearch}
        selectedRoles={filters.selectedRoles}
        setSelectedRoles={filters.setSelectedRoles}
        selectedWeapons={filters.selectedWeapons}
        setSelectedWeapons={filters.setSelectedWeapons}
        weaponSlotFilter={weaponSlotFilter}
        setWeaponSlotFilter={filters.setWeaponSlotFilter}
        selectedRanks={filters.selectedRanks}
        setSelectedRanks={filters.setSelectedRanks}
        selectedPositions={filters.selectedPositions}
        setSelectedPositions={filters.setSelectedPositions}
        isUnassignedOnly={filters.isUnassignedOnly}
        setIsUnassignedOnly={filters.setIsUnassignedOnly}
      />

      <AddMemberModal
        isOpen={isAddMemberModalOpen}
        onClose={() => setIsAddMemberModalOpen(false)}
        groupID={userGroup}
        showToast={showToast}
        onAdd={async (member) => {
          try {
            const res = await fetch(`/api/custom-members/${userGroup}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(member)
            });
            if (res.ok) {
              setIsAddMemberModalOpen(false);
              teamManager.refreshMembers();
              showToast(t('toasts.addMemberSuccess'), 'success');
            } else {
              // NÉM nguyên câu của máy chủ để ô lỗi trong hộp thoại hiện ra. Máy chủ giờ từ
              // chối bản ghi thiếu Discord ID và nói rõ vì sao, thay bằng câu chung chung
              // "lỗi khi lưu" là người dùng không biết phải làm gì.
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error || t('toasts.saveMemberError'));
            }
          } catch (e: any) {
            console.error(e);
            showToast(e?.message || t('toasts.saveMemberError'), 'error');
            throw e;   // để hộp thoại giữ nguyên và hiện lỗi, đừng đóng lại như đã lưu xong
          }
        }}
      />

      {modals.selectedMember && (
        <MemberStatsModal 
          member={modals.selectedMember} 
          onClose={() => modals.setSelectedMember(null)} 
          onUpdate={(updatedMember) => {
            teamManager.handleUpdateMember(updatedMember);
            modals.setStatsModalMembers(prev => prev.map(m => m.id === updatedMember.id ? updatedMember : m));
          }}
          groupID={userGroup}
          showToast={showToast}
        />
      )}

      {modals.settingsTeam && (
        <TeamSettingsModal 
          team={modals.settingsTeam} 
          onClose={() => modals.setSettingsTeam(null)} 
          onSave={handleSaveTeamSettings}
          showToast={showToast}
        />
      )}

      {modals.isStatsModalOpen && (
        <MemberStatsOverviewModal 
          isOpen={modals.isStatsModalOpen}
          onClose={() => modals.setIsStatsModalOpen(false)}
          members={modals.statsModalMembers}
          memberTeamMap={memberTeamMap}
          setSelectedMember={setSelectedMember}
          handleAddToSelectedTeam={handleAddToSelectedTeam}
          handleRemoveFromTeam={teamManager.handleRemoveFromTeam}
          selectedTeamId={selectedTeamId}
          isSelectedTeamSpecial={isSelectedTeamIdSpecial}
          memberAllTeamIds={memberAllTeamIds}
          title={modals.statsModalTitle || ''}
        />
      )}

      {isDiscordModalOpen && (
        <DiscordConfigModal 
          onClose={() => {
            setIsDiscordModalOpen(false);
            fetchDiscordConfig();
          }} 
          groupID={userGroup || ''}
          showToast={showToast}
        />
      )}

      {tacticalBoardSetup && (
        <TacticalBoardModal
          groupID={userGroup || ''}
          setupID={tacticalBoardSetup.id}
          setupName={tacticalBoardSetup.name}
          onClose={() => setTacticalBoardSetup(null)}
          areas={teamManager.areas}
        />
      )}

      <AnimatePresence>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
