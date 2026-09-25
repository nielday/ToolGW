import React, { useState, useEffect } from 'react';
import { Users, Settings, Power, PowerOff, Check, RefreshCw, Calendar, BarChart2, X, Trash2, Plus, Globe, Map, Send, Repeat } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DiscordChannel } from '../models';
import { UserInfo } from './UserInfo';
import { useTranslation } from 'react-i18next';

interface AppHeaderProps {
  totalAssignedMembers: number;
  totalMembers: number;
  onConfirmAllAssigned: () => void;
  isConnected: boolean;
  isInitialStatusChecked: boolean;
  isConnecting: boolean;
  onConnect: () => void;
  onOpenDiscordConfig: () => void;
  isLoadingConfig: boolean;
  discordChannels: DiscordChannel[];
  selectedChannelId: string;
  onChannelChange: (id: string) => void;
  username: string;
  userGroup: string;
  userRole: number;
  onLogout: () => void;
  activePoll: any;
  activeGvgPoll: any;
  handleCreatePoll: (pollData?: { question: string; answers: string[]; allowMultiselect?: boolean; duration?: number; optionMappings?: Record<string, number> }) => void;
  handleCreateGvGPoll: (pollData: { question: string; answers: string[] }) => Promise<boolean>;
  handleClosePoll: () => void;
  handleCloseGvgPoll: () => void;
  handleRepostPoll: (loai?: 'regular' | 'gvg') => Promise<any>;
  closedGvgPoll: any;
  showToast: (message: string, type: 'success' | 'error') => void;
  onPostLineup: () => Promise<void>;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ 
  totalAssignedMembers, 
  totalMembers,
  onConfirmAllAssigned,
  isConnected,
  isInitialStatusChecked,
  isConnecting,
  onConnect,
  onOpenDiscordConfig,
  isLoadingConfig,
  discordChannels,
  selectedChannelId,
  onChannelChange,
  username,
  userGroup,
  userRole,
  onLogout,
  activePoll,
  activeGvgPoll,
  handleCreatePoll,
  handleCreateGvGPoll,
  handleClosePoll,
  handleCloseGvgPoll,
  handleRepostPoll,
  closedGvgPoll,
  showToast,
  onPostLineup
}) => {
  const { t, i18n } = useTranslation();
  const [isPostingLineup, setIsPostingLineup] = useState(false);
  const [isPollActionLoading, setIsPollActionLoading] = useState(false);
  const [isGvgActionLoading, setIsGvgActionLoading] = useState(false);
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState(t('header.defaultPollQuestion'));
  const [pollAnswers, setPollAnswers] = useState([
    { text: t('header.optionJoin'), state: 1 },
    { text: t('header.optionNoJoin'), state: 0 },
    { text: t('header.optionBackup'), state: 2 }
  ]);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [gvgPollTitle, setGvgPollTitle] = useState("");
  const [gvgOptions, setGvgOptions] = useState([
    `${t('header.gvgMatch')} 1 [19h30]`,
    `${t('header.gvgMatch')} 2 [20h15]`,
    `${t('header.gvgMatch')} 3 [21h00]`,
    `${t('header.gvgMatch')} 4 [21h45]`
  ]);
  const [pollError, setPollError] = useState<string | null>(null);

  const toggleLanguage = () => {
    const newLang = i18n.language === 'vi' ? 'en' : 'vi';
    i18n.changeLanguage(newLang);
  };

  useEffect(() => {
    const getDefaultGvGTitle = () => {
      const now = new Date();
      const day = now.getDay(); // 0: Sun, 1: Mon, ..., 6: Sat
      const hour = now.getHours();
      
      const getNextDayDate = (targetDay: number) => {
        const d = new Date(now);
        const diff = (targetDay + 7 - day) % 7;
        d.setDate(now.getDate() + (diff === 0 && (day === 0 || (day === 6 && hour >= 22)) ? 7 : diff));
        return `${d.getDate()}/${d.getMonth() + 1}`;
      };

      if (day === 0 || (day === 6 && hour >= 22)) {
        return `${t('header.gvgSunday')} - ${getNextDayDate(0)}`;
      } else {
        return `${t('header.gvgSaturday')} - ${getNextDayDate(6)}`;
      }
    };
    setGvgPollTitle(getDefaultGvGTitle());
  }, [isScheduleModalOpen, t]);

  const wrappedCreatePoll = async () => {
    setIsPollActionLoading(true);
    const validAnswers = pollAnswers.filter(a => a.text.trim() !== "");
    const optionMappings: Record<string, number> = {};
    validAnswers.forEach(a => {
      optionMappings[a.text] = a.state;
    });

    try {
      await handleCreatePoll({
        question: pollQuestion,
        answers: validAnswers.map(a => a.text),
        optionMappings
      });
      showToast(t('header.createPollSuccess'), 'success');
      setIsPollModalOpen(false);
    } catch (error: any) {
      // Nguyên văn từ máy chủ: thiếu quyền gì, ở kênh nào, sửa ở đâu.
      showToast(error?.message || t('header.createPollError'), 'error');
    } finally {
      setIsPollActionLoading(false);
    }
  };

  // Lỗi hiện nguyên văn từ server ("chưa chọn kênh", "bot chưa kết nối") thay vì một câu
  // chung chung, vì mỗi nguyên nhân cần một hành động sửa khác nhau.
  const wrappedPostLineup = async () => {
    setIsPostingLineup(true);
    try {
      await onPostLineup();
      showToast(t('header.postLineupSuccess'), 'success');
    } catch (error: any) {
      showToast(error?.message || t('header.postLineupError'), 'error');
    } finally {
      setIsPostingLineup(false);
    }
  };

  // Gửi lại poll đang chạy. Bài cũ bị đóng, bài mới nằm cuối kênh, người đã vote giữ nguyên.
  const wrappedRepostPoll = async (loai: 'regular' | 'gvg') => {
    const dangGvg = loai === 'gvg';
    (dangGvg ? setIsGvgActionLoading : setIsPollActionLoading)(true);
    try {
      const data = await handleRepostPoll(loai);
      // Nói luôn giữ được bao nhiêu phiếu: người bấm cần biết phiếu cũ còn hay mất, đó là
      // toàn bộ lý do họ bấm nút này thay vì tạo poll mới.
      showToast(t('header.repostPollSuccess', { count: data?.soPhieuGiuLai ?? 0 }), 'success');
    } catch (error: any) {
      showToast(error?.message || t('header.repostPollError'), 'error');
    } finally {
      (dangGvg ? setIsGvgActionLoading : setIsPollActionLoading)(false);
    }
  };

  const wrappedClosePoll = async () => {
    setIsPollActionLoading(true);
    try {
      await handleClosePoll();
      showToast(t('header.closePollSuccess'), 'success');
    } catch (error) {
      showToast(t('header.closePollError'), 'error');
    } finally {
      setIsPollActionLoading(false);
    }
  };

  const wrappedCloseGvgPoll = async () => {
    setIsGvgActionLoading(true);
    try {
      await handleCloseGvgPoll();
      showToast(t('header.closeGvgSuccess'), 'success');
    } catch (error) {
      showToast(t('header.closeGvgError'), 'error');
    } finally {
      setIsGvgActionLoading(false);
    }
  };

  const wrappedCreateGvGPoll = async () => {
    setIsGvgActionLoading(true);
    setPollError(null);
    
    try {
      if (activeGvgPoll) {
        await handleCloseGvgPoll();
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const success = await handleCreateGvGPoll({
        question: gvgPollTitle,
        answers: gvgOptions.filter(opt => opt.trim() !== "")
      });
      
      if (success) {
        showToast(t('header.openGvgSuccess'), 'success');
        setIsScheduleModalOpen(false);
      } else {
        setPollError(t('header.pollErrorBot'));
        showToast(t('header.openGvgError'), 'error');
      }
    } catch (error: any) {
      // Hiện NGUYÊN câu của máy chủ trong khung đỏ. Câu đó nói rõ thiếu quyền gì ở kênh nào
      // và sửa ở đâu; thay bằng câu chung chung là bắt người dùng đi mở console.
      setPollError(error?.message || t('header.pollErrorBot'));
      showToast(t('header.openGvgError'), 'error');
    } finally {
      setIsGvgActionLoading(false);
    }
  };

  return (
    <header className="z-40 flex items-center justify-between border-b border-[#1E1F22] bg-[#1E1F22] px-6 py-3 shadow-sm">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Users className="text-[#5865F2]" size={24} />
          <div className="flex flex-col">
            <h1 className="text-lg font-bold text-[#F2F3F5] leading-tight">{t('header.title')}</h1>
            <span className="text-xs font-medium text-[#949BA4] leading-tight">{t('header.subtitle')}</span>
          </div>
        </div>

        {/* Discord Connection & Channel Selection */}
        <div className="flex items-center gap-2 rounded-md bg-[#2B2D31] p-1 border border-[#3F4147] ml-2">
          {/* Ô dưới chọn kênh ĐĂNG ĐỘI HÌNH. Nó từng kiêm luôn nguồn danh sách thành viên
              nên bắt phải là kênh voice, giờ nguồn đó đã tách sang khung tick kênh voice ở
              cột trái. Kênh đăng poll cũng là ô riêng trong Cấu hình Discord. */}
          {discordChannels.length > 0 ? (
            <select
              title="Kênh sẽ nhận bài Đăng đội hình. Nguồn danh sách thành viên lấy từ khung &quot;Kênh voice lấy người&quot; ở cột trái; kênh đăng poll đặt riêng trong Cấu hình Discord."
              value={selectedChannelId}
              onChange={(e) => onChannelChange(e.target.value)}
              disabled={isConnecting}
              className="bg-[#1E1F22] text-[#DBDEE1] text-xs font-medium px-2 py-1.5 rounded border border-[#3F4147] outline-none focus:ring-1 focus:ring-[#5865F2] min-w-[140px] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {discordChannels.map(channel => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="bg-[#1E1F22] text-[#949BA4] text-[10px] font-medium px-2 py-1.5 rounded border border-[#3F4147] min-w-[140px] flex items-center justify-center italic">
              {t('header.noChannel')}
            </div>
          )}

          {userRole === 2 && (
            <>
              <button 
                onClick={onConnect}
                disabled={isConnecting}
                className={`flex items-center gap-2 rounded px-3 py-1.5 text-xs font-bold transition-all ${
                  isConnected 
                    ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' 
                    : 'bg-[#5865F2] text-white hover:bg-[#4752C4]'
                } disabled:opacity-50`}
              >
                {isConnecting ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : isConnected ? (
                  <PowerOff size={16} />
                ) : (
                  <Power size={16} />
                )}
                {isConnected ? <span className="hidden lg:inline">{t('header.disconnect')}</span> : <span className="hidden lg:inline">{t('header.connectDiscord')}</span>}
              </button>
              
              <div className="flex items-center gap-1 border-l border-[#3F4147] pl-1 ml-1">
                {!isConnected && (
                  <button 
                    onClick={onOpenDiscordConfig}
                    disabled={isLoadingConfig}
                    className="flex h-8 w-8 items-center justify-center rounded text-[#949BA4] hover:bg-[#3F4147] hover:text-[#DBDEE1] transition-colors disabled:opacity-50"
                    title={t('header.discordConfig')}
                  >
                    {isLoadingConfig ? (
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        className="h-4 w-4 rounded-full border-2 border-current border-t-transparent" 
                      />
                    ) : (
                      <Settings size={18} />
                    )}
                  </button>
                )} 
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Top Stats Panel & User Info */}
      <div className="flex items-center gap-4">
        {/* Discord Poll Features - Moved from SetupManagement */}
        <div className="flex items-center gap-2 mr-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => activeGvgPoll ? wrappedCloseGvgPoll() : setIsScheduleModalOpen(true)}
            disabled={!isInitialStatusChecked || !isConnected || isGvgActionLoading}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${activeGvgPoll ? 'bg-[#ed4245] hover:bg-[#c9383b]' : 'bg-[#23A559] hover:bg-[#1D8A4A]'}`}
            title={isConnected ? (activeGvgPoll ? t('header.closeGvgPoll') : t('header.openGvgPoll')) : t('header.connectDiscordTitle')}
          >
            {isGvgActionLoading ? <RefreshCw size={16} className="animate-spin" /> : <Calendar size={16} />}
            <span className="hidden lg:inline">{isGvgActionLoading ? t('common.processing') : activeGvgPoll ? t('header.closeGvgPoll') : t('header.openGvgPoll')}</span>
          </motion.button>

          {/* Gửi lại — chỉ hiện khi đang có poll. Nút hẹp, chỉ có icon: đây là việc thỉnh
              thoảng mới cần, không nên chiếm chỗ ngang hàng hai nút chính. */}
          {/* Hiện cả khi bài đăng ký VỪA BỊ ĐÓNG: cùng một nút, lúc đó nó là nút khôi phục
              (đăng lại bài y hệt, giữ nguyên người đã vote). Có chữ để khỏi nhầm với nút Mở
              đăng ký bên cạnh, vốn tạo bài mới tinh và mất hết phiếu cũ. */}
          {(activeGvgPoll || closedGvgPoll) && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => wrappedRepostPoll('gvg')}
              disabled={!isConnected || isGvgActionLoading}
              className={`flex items-center gap-2 rounded-md py-2 text-sm font-medium text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed bg-[#4E5058] hover:bg-[#6D6F78] ${activeGvgPoll ? 'px-2.5' : 'px-3'}`}
              title={activeGvgPoll ? t('header.repostGvgPollTitle') : t('header.restoreGvgPollTitle')}
            >
              <Repeat size={16} />
              {!activeGvgPoll && <span className="hidden lg:inline">{t('header.restoreGvgPoll')}</span>}
            </motion.button>
          )}

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => activePoll ? wrappedClosePoll() : setIsPollModalOpen(true)}
            disabled={!isInitialStatusChecked || !isConnected || isPollActionLoading}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${activePoll ? 'bg-[#ed4245] hover:bg-[#c9383b]' : 'bg-[#5865F2] hover:bg-[#4752C4]'}`}
            title={isConnected ? (activePoll ? t('header.closePoll') : t('header.createPoll')) : t('header.connectDiscordTitle')}
          >
            {isPollActionLoading ? <RefreshCw size={16} className="animate-spin" /> : <BarChart2 size={16} />}
            <span className="hidden lg:inline">{isPollActionLoading ? t('common.processing') : activePoll ? t('header.closePoll') : t('header.createPoll')}</span>
          </motion.button>

          {activePoll && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => wrappedRepostPoll('regular')}
              disabled={!isConnected || isPollActionLoading}
              className="flex items-center rounded-md px-2.5 py-2 text-sm font-medium text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed bg-[#4E5058] hover:bg-[#6D6F78]"
              title={t('header.repostPollTitle')}
            >
              <Repeat size={16} />
            </motion.button>
          )}

          {/* Đăng đội hình đã xếp ra kênh Discord. Khoá lại khi bot chưa kết nối, vì bấm
              lúc đó chỉ nhận lỗi từ server chứ không làm được gì. */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={wrappedPostLineup}
            disabled={!isInitialStatusChecked || !isConnected || isPostingLineup}
            className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed bg-[#5865F2] hover:bg-[#4752C4]"
            title={isConnected ? t('header.postLineup') : t('header.connectDiscordTitle')}
          >
            {isPostingLineup ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
            <span className="hidden lg:inline">{isPostingLineup ? t('common.processing') : t('header.postLineup')}</span>
          </motion.button>
        </div>

        <div className="flex items-center gap-6 rounded-md bg-[#2B2D31] px-4 py-2 border border-[#3F4147] h-full">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#949BA4]">{t('common.total')}:</span>
            <span className="font-mono text-xl font-bold text-[#F2F3F5]">{totalMembers}</span>
          </div>
          <div className="h-6 w-px bg-[#3F4147]"></div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#949BA4]">{t('common.assigned')}:</span>
            <span className="font-mono text-xl font-bold text-[#2ecc71]">{totalAssignedMembers}</span>
          </div>          
        </div>

        <div className="h-8 w-px bg-[#3F4147] mx-2"></div>

        <UserInfo 
          username={username} 
          userGroup={userGroup} 
          onLogout={onLogout} 
          currentLanguage={i18n.language}
          onToggleLanguage={toggleLanguage}
        />
      </div>

      <AnimatePresence>
        {isScheduleModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-md overflow-hidden rounded-xl border border-[#1E1F22] bg-[#313338] shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-[#1E1F22] bg-[#2B2D31] px-6 py-4">
                <h3 className="text-lg font-semibold text-white">{t('header.pollScheduled')}</h3>
                <button
                  onClick={() => {
                    setIsScheduleModalOpen(false);
                    setPollError(null);
                  }}
                  className="text-[#949BA4] hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="mb-2 block text-xs font-bold uppercase text-[#B5BAC1]">{t('header.pollTitle')}</label>
                  <textarea
                    value={gvgPollTitle}
                    onChange={(e) => setGvgPollTitle(e.target.value)}
                    placeholder="..."
                    rows={3}
                    className="w-full rounded bg-[#1E1F22] px-3 py-2 text-sm text-[#DBDEE1] outline-none ring-1 ring-[#1E1F22] focus:ring-[#5865F2] transition-all resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase text-[#B5BAC1]">{t('header.matchLabel')}</label>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                    {gvgOptions.map((option, index) => (
                      <div key={`gvg-opt-${index}`} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => {
                            const newOptions = [...gvgOptions];
                            newOptions[index] = e.target.value;
                            setGvgOptions(newOptions);
                          }}
                          placeholder={`${t('header.gvgMatch')} ${index + 1}`}
                          className="w-full rounded bg-[#1E1F22] px-3 py-2 text-sm text-[#DBDEE1] outline-none ring-1 ring-[#1E1F22] focus:ring-[#5865F2] transition-all"
                        />
                        <button
                          onClick={() => {
                            if (gvgOptions.length > 1) {
                              const newOptions = gvgOptions.filter((_, i) => i !== index);
                              setGvgOptions(newOptions);
                            }
                          }}
                          disabled={gvgOptions.length <= 1}
                          className="p-2 text-[#949BA4] hover:text-[#ed4245] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={t('header.deleteMatch')}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      if (gvgOptions.length < 10) {
                        setGvgOptions([...gvgOptions, ""]);
                      }
                    }}
                    disabled={gvgOptions.length >= 10}
                    className="flex items-center gap-1 text-xs text-[#5865F2] hover:text-[#4752C4] disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                  >
                    <Plus size={14} />
                    {t('header.addOption')}
                  </button>
                </div>
                {pollError && (
                  <div className="rounded bg-[#ed4245]/10 p-3 text-sm text-[#ed4245] border border-[#ed4245]/20">
                    {pollError}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-3 bg-[#2B2D31] px-6 py-4">
                <button
                  onClick={() => {
                    setIsScheduleModalOpen(false);
                    setPollError(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-white hover:underline"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={wrappedCreateGvGPoll}
                  disabled={isGvgActionLoading || !gvgPollTitle.trim() || gvgOptions.filter(opt => opt.trim() !== "").length === 0}
                  className="flex items-center gap-2 rounded bg-[#5865F2] px-6 py-2 text-sm font-medium text-white hover:bg-[#4752C4] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGvgActionLoading ? <RefreshCw size={16} className="animate-spin" /> : <BarChart2 size={16} />}
                  {t('header.openGvgPoll')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isPollModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-md overflow-hidden rounded-xl border border-[#1E1F22] bg-[#313338] shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-[#1E1F22] bg-[#2B2D31] px-6 py-4">
                <h3 className="text-lg font-semibold text-white">{t('header.createPoll')}</h3>
                <button
                  onClick={() => setIsPollModalOpen(false)}
                  className="text-[#949BA4] hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="mb-2 block text-xs font-bold uppercase text-[#B5BAC1]">{t('header.pollQuestion')}</label>
                  <textarea
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder="..."
                    rows={3}
                    className="w-full rounded bg-[#1E1F22] px-3 py-2 text-sm text-[#DBDEE1] outline-none ring-1 ring-[#1E1F22] focus:ring-[#5865F2] transition-all resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="mb-2 block text-xs font-bold uppercase text-[#B5BAC1]">{t('header.pollOptions')}</label>
                  <div className="space-y-2">
                    {pollAnswers.map((answer, index) => (
                      <div key={`poll-ans-${index}`} className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const newAnswers = [...pollAnswers];
                            newAnswers[index].state = (newAnswers[index].state + 1) % 3;
                            setPollAnswers(newAnswers);
                          }}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded transition-all ${
                            answer.state === 1 
                              ? 'bg-[#5865F2] text-white' 
                              : answer.state === 2 
                                ? 'bg-[#4F545C] text-white' 
                                : 'bg-[#1E1F22] border border-[#1E1F22]'
                          }`}
                          title={answer.state === 1 ? t('header.statusOnline') : answer.state === 2 ? t('header.statusBackup') : t('header.statusOffline')}
                        >
                          {(answer.state === 1 || answer.state === 2) && <Check size={14} strokeWidth={3} />}
                        </button>
                        <input
                          type="text"
                          value={answer.text}
                          onChange={(e) => {
                            const newAnswers = [...pollAnswers];
                            newAnswers[index].text = e.target.value;
                            setPollAnswers(newAnswers);
                          }}
                          placeholder={`${t('header.pollOptions')} ${index + 1}`}
                          className="flex-1 rounded bg-[#1E1F22] px-3 py-2 text-sm text-[#DBDEE1] outline-none ring-1 ring-[#1E1F22] focus:ring-[#5865F2] transition-all"
                        />
                        {pollAnswers.length > 2 && (
                          <button
                            onClick={() => {
                              const newAnswers = pollAnswers.filter((_, i) => i !== index);
                              setPollAnswers(newAnswers);
                            }}
                            className="text-[#ed4245] hover:text-[#ff7377] p-1"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {pollAnswers.length < 10 && (
                    <button
                      onClick={() => setPollAnswers([...pollAnswers, { text: "", state: 0 }])}
                      className="mt-2 flex items-center gap-1 text-sm text-[#5865F2] hover:text-[#7289DA] font-medium"
                    >
                      <Plus size={14} />
                      {t('header.addOption')}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 bg-[#2B2D31] px-6 py-4">
                <button
                  onClick={() => setIsPollModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-white hover:underline"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={wrappedCreatePoll}
                  disabled={isPollActionLoading || !pollQuestion.trim() || pollAnswers.filter(a => a.text.trim() !== "").length < 2}
                  className="flex items-center gap-2 rounded bg-[#5865F2] px-6 py-2 text-sm font-medium text-white hover:bg-[#4752C4] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPollActionLoading ? <RefreshCw size={16} className="animate-spin" /> : <BarChart2 size={16} />}
                  {t('header.createPoll')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </header>
  );
};
