import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Member, Team, Area, SavedSetup, SetupMetadata } from '../models';
import { defaultReqs, WEAPONS, RANKS } from '../constants';
import { initialUnassigned, getTranslatedAreas, isTowerArea, isPVPArea, normalizeDiscordName } from '../utils';

const isSpecialArea = (areaName: string) => isTowerArea(areaName) || isPVPArea(areaName);

// Nhớ thiết lập đang mở để F5 xong quay lại đúng chỗ cũ.
// Tách khoá theo nhóm: hai nhóm dùng chung trình duyệt thì không giẫm lên nhau.
// Cố ý để ở localStorage chứ không lưu server: đây là "cửa sổ này đang xem cái nào", chuyện
// riêng của từng máy. Lưu server thì người này mở là người kia cũng bị nhảy theo.
const khoaThietLapDangMo = (g: string) => `lastSetupId:${g}`;
const nhoThietLapDangMo = (g: string, id: string | null) => {
  if (!g) return;
  try {
    if (id) localStorage.setItem(khoaThietLapDangMo(g), id);
    else localStorage.removeItem(khoaThietLapDangMo(g));
  } catch { /* chế độ riêng tư chặn localStorage thì thôi, không đáng để vỡ cả trang */ }
};

export function useTeamManager(isConnected: boolean, groupID: string, username: string = 'Unknown', showToast?: (msg: string, type: 'success' | 'error' | 'info') => void) {
  const { t } = useTranslation();
  const [unassignedMembers, setUnassignedMembers] = useState<Member[]>(initialUnassigned);
  const [areas, setAreas] = useState<Area[]>(() => getTranslatedAreas(t));
  
  // Save State
  const [savedSetups, setSavedSetups] = useState<SetupMetadata[]>([]);
  const [isSetupDropdownOpen, setIsSetupDropdownOpen] = useState(false);
  const [currentSetupName, setCurrentSetupName] = useState(() => t('setup.newSetup'));
  const [currentSetupId, setCurrentSetupId] = useState<string | null>(null);

  // Selection State
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const [memberSource, setMemberSource] = useState<'discord' | 'custom' | 'poll' | 'gvg'>('discord');
  const [lastRefreshedSource, setLastRefreshedSource] = useState<'discord' | 'custom' | 'poll' | 'gvg' | null>(null);

  const [activePoll, setActivePoll] = useState<any>(null);
  const [activeGvgPoll, setActiveGvgPoll] = useState<any>(null);
  const [gvgPollOptions, setGvgPollOptions] = useState<string[]>([]);
  const [gvgOptionIndex, setGvgOptionIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!isConnected && (memberSource === 'discord' || memberSource === 'poll' || memberSource === 'gvg')) {
      setMemberSource('custom');
    }
  }, [isConnected, memberSource]);

  useEffect(() => {
    if (!groupID) {
      setActivePoll(null);
      setActiveGvgPoll(null);
      setGvgPollOptions([]);
      return;
    }
    const fetchPolls = async () => {
      try {
        const res = await fetch(`/api/poll/${groupID}`);
        if (res.ok) {
          const data = await res.json();
          setActivePoll(data);
        } else {
          setActivePoll(null);
        }
      } catch (err) {
        console.error('Failed to fetch regular poll:', err);
        setActivePoll(null);
        if (showToast) showToast(t('header.createPollError'), 'error');
      }
      
      try {
        const resGvg = await fetch(`/api/poll/${groupID}?type=gvg`);
        if (resGvg.ok) {
          const dataGvg = await resGvg.json();
          if (dataGvg && !dataGvg.isClosed) {
            setActiveGvgPoll(dataGvg);
            if (dataGvg.isGvg && dataGvg.answers) {
              setGvgPollOptions(dataGvg.answers);
            } else {
              setGvgPollOptions([]);
            }
          } else {
            setActiveGvgPoll(null);
            setGvgPollOptions([]);
          }
        } else {
          setActiveGvgPoll(null);
          setGvgPollOptions([]);
        }
      } catch (err) {
        console.error('Failed to fetch GvG poll:', err);
        setActiveGvgPoll(null);
        setGvgPollOptions([]);
        if (showToast) showToast(t('header.openGvgError'), 'error');
      }
    };
    fetchPolls();
  }, [groupID]);

  const handleCreatePoll = async (pollData?: { question: string; answers: string[]; allowMultiselect?: boolean; duration?: number; optionMappings?: Record<string, number>; channelId?: string }) => {
    try {
      const res = await fetch(`/api/poll/${groupID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pollData || {})
      });
      if (res.ok) {
        const data = await res.json();
        setActivePoll(data);
      } else {
        // NÉM NGUYÊN câu của máy chủ. Nuốt vào console rồi hiện câu chung chung "kiểm tra
        // lại quyền của Bot" thì người dùng không biết thiếu quyền GÌ ở kênh NÀO, phải mở
        // console mới thấy sự thật.
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t('header.createPollError'));
      }
    } catch (err: any) {
      console.error('Error creating poll:', err);
      throw err;
    }
  };

  const handleCreateGvGPoll = async (pollData: { question: string; answers: string[]; channelId?: string }) => {
    try {
      const res = await fetch(`/api/poll/${groupID}?type=gvg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...pollData,
          allowMultiselect: true,
          duration: 168,
          isGvg: true
        })
      });
      if (res.ok) {
        const data = await res.json();
        setActiveGvgPoll({ ...data, isGvg: true });
        setGvgPollOptions(pollData.answers);
        setGvgOptionIndex(null);
        if (memberSource === 'gvg') {
          setMemberSource('discord');
        }
        return true;
      } else {
        // Xem chú thích ở handleCreatePoll: ném nguyên câu của máy chủ, đừng nuốt.
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t('header.pollErrorBot'));
      }
    } catch (err: any) {
      console.error('Error creating GvG poll:', err);
      throw err;
    }
  };

  /**
   * Gửi lại poll: đăng một bài poll y hệt ở cuối kênh khi bài cũ đã trôi, giữ nguyên những
   * người đã vote (máy chủ cất phiếu cũ rồi gộp vào kết quả, xem api/MatchResultModal.ts).
   */
  const handleRepostPoll = async (loai: 'regular' | 'gvg' = 'regular') => {
    const duong = loai === 'gvg' ? `/api/poll/${groupID}/repost?type=gvg` : `/api/poll/${groupID}/repost`;
    const res = await fetch(duong, { method: 'POST' });
    if (!res.ok) {
      // Ném nguyên câu của máy chủ, xem chú thích ở handleCreatePoll.
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || t('header.repostPollError'));
    }
    const data = await res.json();
    if (loai === 'gvg') setActiveGvgPoll({ ...data, isGvg: true });
    else setActivePoll(data);
    return data;
  };

  const handleClosePoll = async () => {
    try {
      const res = await fetch(`/api/poll/${groupID}/close`, { method: 'POST' });
      if (res.ok) {
        setActivePoll(null);
        if (memberSource === 'poll') {
          setMemberSource('discord');
        }
      } else {
        const err = await res.json();
        console.error('Failed to close poll:', err);
      }
    } catch (err) {
      console.error('Error closing poll:', err);
    }
  };

  const handleCloseGvgPoll = async () => {
    try {
      const res = await fetch(`/api/poll/${groupID}/close?type=gvg`, { method: 'POST' });
      if (res.ok) {
        setActiveGvgPoll(null);
      } else {
        const err = await res.json();
        console.error('Failed to close GvG poll:', err);
      }
    } catch (err) {
      console.error('Error closing GvG poll:', err);
    }
  };

  // Fetch setups from server on mount
  useEffect(() => {
    if (!groupID) return;
    const fetchSetups = async () => {
      try {
        const response = await fetch(`/api/setups/${groupID}`);
        const contentType = response.headers.get('content-type');
        if (response.ok && contentType && contentType.includes('application/json')) {
          const data = await response.json();
          setSavedSetups(data);

          // MỞ LẠI thiết lập đang xem trước lúc F5.
          // Bấm Lưu là dữ liệu vào DB thật, nhưng trang luôn mở ra "Thiết lập mới" trắng
          // trơn: chỗ này chỉ nạp DANH SÁCH thiết lập rồi thôi, không ai bảo nó mở cái nào.
          // Người dùng tưởng bấm Lưu không ăn.
          // Chỉ mở lại đúng cái TRÌNH DUYỆT NÀY đang xem, không tự mở cái mới nhất của nhóm:
          // hai người xếp hai bài khác nhau mà cứ nhảy sang bài người kia thì loạn.
          let idCu: string | null = null;
          try { idCu = localStorage.getItem(khoaThietLapDangMo(groupID)); } catch {}
          if (idCu && Array.isArray(data)) {
            const con = data.find((s: SetupMetadata) => s.id === idCu);
            if (con) handleLoadSetup(con);
            else nhoThietLapDangMo(groupID, null);   // đã bị xoá thì đừng nhớ nữa
          }
        } else if (!response.ok) {
          console.error(`Setups fetch failed with status ${response.status}`);
        }
      } catch (error) {
        console.error('Failed to fetch setups:', error);
        if (showToast) showToast(t('setup.noSavedSetups'), 'error');
      }
    };
    fetchSetups();
  }, [groupID]);

  const handleAddArea = () => {
    const newArea: Area = {
      id: `a${Date.now()}`,
      name: 'Nhóm mới',
      teams: []
    };
    setAreas([...areas, newArea]);
  };

  const handleDeleteArea = (areaId: string) => {
    const area = areas.find(a => a.id === areaId);
    if (area?.isLocked) return;
    
    // If deleting a normal area, remove its members from special teams
    if (area && !isSpecialArea(area.name)) {
      const memberIdsToRemove = new Set<string>();
      area.teams.forEach(t => t.members.forEach(m => memberIdsToRemove.add(m.id)));
      
      setAreas(prev => prev.filter(a => a.id !== areaId).map(a => {
        if (isSpecialArea(a.name)) {
          return {
            ...a,
            teams: a.teams.map(t => ({
              ...t,
              members: t.members.filter(m => !memberIdsToRemove.has(m.id))
            }))
          };
        }
        return a;
      }));
    } else {
      setAreas(areas.filter(a => a.id !== areaId));
    }
  };

  const handleRenameArea = (areaId: string, newName: string) => {
    const area = areas.find(a => a.id === areaId);
    if (area?.isLocked) return;
    setAreas(areas.map(a => a.id === areaId ? { ...a, name: newName } : a));
  };

  const handleAddTeam = (areaId: string) => {
    const area = areas.find(a => a.id === areaId);
    if (area?.isLocked) return;
    const newTeam: Team = {
      id: `t${Date.now()}`,
      name: 'Nhóm mới',
      members: [],
      requirements: {}
    };
    setAreas(areas.map(a => a.id === areaId ? { ...a, teams: [...a.teams, newTeam] } : a));
  };

  const handleDeleteTeam = (teamId: string) => {
    let isLocked = false;
    let teamToRemove: Team | undefined;
    let areaOfTeam: Area | undefined;

    areas.forEach(area => {
      const team = area.teams.find(t => t.id === teamId);
      if (team) {
        teamToRemove = team;
        areaOfTeam = area;
        if (team.isLocked) isLocked = true;
      }
    });

    if (isLocked) return;

    // If deleting a normal team, remove its members from special teams
    if (teamToRemove && areaOfTeam && !isSpecialArea(areaOfTeam.name)) {
      const memberIdsToRemove = new Set(teamToRemove.members.map(m => m.id));
      setAreas(areas.map(a => ({
        ...a,
        teams: a.teams.filter(t => t.id !== teamId).map(t => {
          if (isSpecialArea(a.name)) {
            return {
              ...t,
              members: t.members.filter(m => !memberIdsToRemove.has(m.id))
            };
          }
          return t;
        })
      })));
    } else {
      setAreas(areas.map(a => ({
        ...a,
        teams: a.teams.filter(t => t.id !== teamId)
      })));
    }
    
    if (selectedTeamId === teamId) {
      setSelectedTeamId(null);
    }
  };

  const handleRenameTeam = (teamId: string, newName: string) => {
    let isLocked = false;
    areas.forEach(area => {
      const team = area.teams.find(t => t.id === teamId);
      if (team?.isLocked) isLocked = true;
    });

    if (isLocked) return;

    setAreas(areas.map(a => ({
      ...a,
      teams: a.teams.map(t => t.id === teamId ? { ...t, name: newName } : t)
    })));
  };

  const handleUpdateUnassignedMember = async (updatedMember: Member) => {
    setUnassignedMembers(prev => prev.map(m => m.id === updatedMember.id ? updatedMember : m));
    
    try {
      await fetch(`/api/member-profiles/${groupID}?name=${encodeURIComponent(updatedMember.name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedMember)
      });
    } catch (error) {
      console.error('Failed to save member profile:', error);
    }
  };

  const handleUpdateSetupMember = (updatedMember: Member) => {
    setAreas(prev => prev.map(a => ({
      ...a,
      teams: a.teams.map(t => ({
        ...t,
        members: t.members.map(m => m.id === updatedMember.id ? updatedMember : m)
      }))
    })));
  };

  const handleConfirmAllAssigned = () => {
    setAreas(prev => prev.map(a => ({
      ...a,
      teams: a.teams.map(t => ({
        ...t,
        members: t.members.map(m => ({ 
          ...m, 
          stats: {
            leagueMatches: m.stats?.leagueMatches || 0,
            ratedMatches: m.stats?.ratedMatches || 0,
            confirmedMatches: m.isConfirmed ? (m.stats?.confirmedMatches || 0) : (m.stats?.confirmedMatches || 0) + 1
          },
          isConfirmed: true 
        }))
      }))
    })));
  };

  const handleClearTeamMembers = (teamId: string) => {
    const areaOfTeam = areas.find(a => a.teams.some(t => t.id === teamId));
    const isNormalTeam = areaOfTeam && !isSpecialArea(areaOfTeam.name);
    
    const teamToClear = areaOfTeam?.teams.find(t => t.id === teamId);
    const memberIdsToRemove = new Set(teamToClear?.members.map(m => m.id) || []);

    setAreas(areas.map(a => ({
      ...a,
      teams: a.teams.map(t => {
        if (t.id === teamId) {
          return { ...t, members: [] };
        }
        // If we cleared a normal team, also remove those members from special teams
        if (isNormalTeam && isSpecialArea(a.name)) {
          return {
            ...t,
            members: t.members.filter(m => !memberIdsToRemove.has(m.id))
          };
        }
        return t;
      })
    })));
  };

  const handleClearAreaMembers = (areaId: string) => {
    const areaToClear = areas.find(a => a.id === areaId);
    const isNormalArea = areaToClear && !isSpecialArea(areaToClear.name);
    const memberIdsToRemove = new Set<string>();
    if (isNormalArea) {
      areaToClear.teams.forEach(t => t.members.forEach(m => memberIdsToRemove.add(m.id)));
    }

    setAreas(areas.map(a => {
      if (a.id === areaId) {
        return {
          ...a,
          teams: a.teams.map(t => ({ ...t, members: [] }))
        };
      }
      // If we cleared a normal area, also remove those members from special teams
      if (isNormalArea && isSpecialArea(a.name)) {
        return {
          ...a,
          teams: a.teams.map(t => ({
            ...t,
            members: t.members.filter(m => !memberIdsToRemove.has(m.id))
          }))
        };
      }
      return a;
    }));
  };

  const handleMoveMember = (memberId: string, sourceId: string, targetId: string, targetIndex?: number) => {
    if (sourceId === targetId) {
      // Reordering within the same container
      if (sourceId === 'unassigned') return; // No reordering in unassigned
      
      setAreas(prev => prev.map(area => ({
        ...area,
        teams: area.teams.map(team => {
          if (team.id === sourceId) {
            const newMembers = [...team.members];
            const currentIndex = newMembers.findIndex(m => m.id === memberId);
            if (currentIndex === -1 || targetIndex === undefined) return team;
            
            const [movedMember] = newMembers.splice(currentIndex, 1);
            
            // Adjust targetIndex if dragging downwards
            let finalIndex = targetIndex;
            if (currentIndex < targetIndex) {
              finalIndex -= 1;
            }
            
            newMembers.splice(finalIndex, 0, movedMember);
            return { ...team, members: newMembers };
          }
          return team;
        })
      })));
      return;
    }

    if (targetId === 'unassigned') {
      return; // Cannot drag back to unassigned list
    }

    // Check if target is a team and if it's in "Team trụ" area
    let targetAreaForMember: Area | undefined;
    let targetTeamForMember: Team | undefined;
    for (const area of areas) {
      const team = area.teams.find(t => t.id === targetId);
      if (team) {
        targetAreaForMember = area;
        targetTeamForMember = team;
        break;
      }
    }

    const isSpecialArea = (name: string) => isTowerArea(name) || isPVPArea(name);
    const targetIsSpecial = targetAreaForMember && isSpecialArea(targetAreaForMember.name);

    // Rule: Cannot drag from unassigned sidebar to special team unless they are already in a team
    if (sourceId === 'unassigned' && targetIsSpecial) {
      const isInAnyTeam = areas.some(a => a.teams.some(t => t.members.some(m => m.id === memberId)));
      if (!isInAnyTeam) {
        return;
      }
    }

    if (targetIsSpecial && targetTeamForMember && targetTeamForMember.members.length >= 3) {
      return;
    }

    let memberToMove: Member | undefined;

    // Find the member to move
    if (sourceId === 'unassigned') {
      memberToMove = unassignedMembers.find(m => m.id === memberId);
    } else {
      for (const area of areas) {
        const team = area.teams.find(t => t.id === sourceId);
        if (team) {
          memberToMove = team.members.find(m => m.id === memberId);
          break;
        }
      }
    }

    if (!memberToMove) return;

    setAreas(prev => {
      let nextAreas = [...prev];
      
      const sourceArea = prev.find(a => a.teams.some(t => t.id === sourceId));
      const sourceIsSpecial = sourceArea && isSpecialArea(sourceArea.name);

      // Rule: If target is special, we only remove from source if source is also a special area of the SAME type.
      // Rule: If target is NOT special, we remove from any other NOT special team.
      
      if (targetIsSpecial) {
        const targetIsTower = isTowerArea(targetAreaForMember!.name);
        const targetIsPVP = isPVPArea(targetAreaForMember!.name);

        // Rule: A member can only be in ONE team of the SAME special type (PVP or Tower).
        // Remove from teams in the same special category first.
        nextAreas = nextAreas.map(a => {
          const areaIsTower = isTowerArea(a.name);
          const areaIsPVP = isPVPArea(a.name);

          if ((targetIsTower && areaIsTower) || (targetIsPVP && areaIsPVP)) {
            return {
              ...a,
              teams: a.teams.map(t => ({
                ...t,
                members: t.members.filter(m => m.id !== memberId)
              }))
            };
          }
          return a;
        });
        
        // If source was NOT special, we don't remove from source (normal team)
        // because we want them to stay in the normal team.
      } else {
        // Target is NOT special
        // Remove from any other NOT special team
        nextAreas = nextAreas.map(a => {
          if (isSpecialArea(a.name)) return a; // Don't remove from special teams
          return {
            ...a,
            teams: a.teams.map(t => ({
              ...t,
              members: t.members.filter(m => m.id !== memberId)
            }))
          };
        });
      }

      // 3. Add to target
      if (targetId.startsWith('area-')) {
        const areaId = targetId.replace('area-', '');
        const targetArea = nextAreas.find(a => a.id === areaId);
        
        // Rule: Cannot create new team in special area by dragging to empty space/header
        if (targetArea && isSpecialArea(targetArea.name)) {
          return prev;
        }

        return nextAreas.map(area => {
          if (area.id === areaId) {
            const newTeam: Team = {
              id: `t${Date.now()}`,
              name: 'Nhóm mới',
              members: [memberToMove!],
              requirements: { ...defaultReqs }
            };
            return { ...area, teams: [...area.teams, newTeam] };
          }
          return area;
        });
      }

      return nextAreas.map(area => ({
        ...area,
        teams: area.teams.map(team => {
          if (team.id === targetId) {
            const newMembers = [...team.members];
            if (targetIndex !== undefined) {
              newMembers.splice(targetIndex, 0, memberToMove!);
            } else {
              newMembers.push(memberToMove!);
            }
            return { ...team, members: newMembers };
          }
          return team;
        })
      }));
    });
  };

  const handleMoveTeam = (teamId: string, sourceAreaId: string, targetId: string) => {
    setAreas(prev => {
      // Find the team to move from the current state (prev)
      let currentTeamToMove: Team | undefined;
      for (const area of prev) {
        if (area.id === sourceAreaId) {
          currentTeamToMove = area.teams.find(t => t.id === teamId);
          break;
        }
      }

      if (!currentTeamToMove || currentTeamToMove.isLocked) return prev;

      // targetId can be an area ID (area-ID), a team ID (team-ID), or 'unassigned'
      if (targetId === 'unassigned') {
        const sourceArea = prev.find(a => a.id === sourceAreaId);
        const isNormalArea = sourceArea && !isSpecialArea(sourceArea.name);
        const teamToRemove = sourceArea?.teams.find(t => t.id === teamId);
        const memberIdsToRemove = new Set(teamToRemove?.members.map(m => m.id) || []);

        // Remove team and unassign all its members
        return prev.map(area => {
          if (area.id === sourceAreaId) {
            return { ...area, teams: area.teams.filter(t => t.id !== teamId) };
          }
          // If we removed a normal team, also remove its members from special teams
          if (isNormalArea && isSpecialArea(area.name)) {
            return {
              ...area,
              teams: area.teams.map(t => ({
                ...t,
                members: t.members.filter(m => !memberIdsToRemove.has(m.id))
              }))
            };
          }
          return area;
        });
      } else if (targetId.startsWith('area-')) {
        const targetAreaId = targetId.replace('area-', '');
        const targetArea = prev.find(a => a.id === targetAreaId);
        if (sourceAreaId === targetAreaId || targetArea?.isLocked) return prev;

        // Rule: Cannot move a team into a special area (members must stay in a Normal area)
        if (targetArea && isSpecialArea(targetArea.name)) {
          return prev;
        }

        // Remove from source
        const updatedAreas = prev.map(area => {
          if (area.id === sourceAreaId) {
            return { ...area, teams: area.teams.filter(t => t.id !== teamId) };
          }
          return area;
        });

        // Add to target
        return updatedAreas.map(area => {
          if (area.id === targetAreaId) {
            return { ...area, teams: [...area.teams, currentTeamToMove!] };
          }
          return area;
        });
      } else {
        // targetId is a team ID - Merge
        const targetTeamId = targetId;
        if (teamId === targetTeamId) return prev;

        // Check if target team is in "Team trụ"
        let targetAreaForMerge: Area | undefined;
        let targetTeamForMerge: Team | undefined;
        for (const area of prev) {
          const team = area.teams.find(t => t.id === targetTeamId);
          if (team) {
            targetAreaForMerge = area;
            targetTeamForMerge = team;
            break;
          }
        }

        // Rule: Cannot merge a team into a special team (members must stay in a Normal area)
        if (targetAreaForMerge && isSpecialArea(targetAreaForMerge.name)) {
          return prev;
        }

        // Check if target team is locked
        let isTargetLocked = false;
        for (const area of prev) {
          const team = area.teams.find(t => t.id === targetTeamId);
          if (team?.isLocked) {
            isTargetLocked = true;
            break;
          }
        }
        if (isTargetLocked) return prev;

        // Find target team and merge members
        let membersToMerge: Member[] = currentTeamToMove!.members;
        
        const updatedAreas = prev.map(area => {
          // Remove source team
          if (area.id === sourceAreaId) {
            return { ...area, teams: area.teams.filter(t => t.id !== teamId) };
          }
          return area;
        });

        return updatedAreas.map(area => {
          // Add members to target team
          return {
            ...area,
            teams: area.teams.map(team => {
              if (team.id === targetTeamId) {
                // Prevent duplicate members if they somehow already exist
                const existingMemberIds = new Set(team.members.map(m => m.id));
                const uniqueMembersToMerge = membersToMerge.filter(m => !existingMemberIds.has(m.id));
                return { ...team, members: [...team.members, ...uniqueMembersToMerge] };
              }
              return team;
            })
          };
        });
      }
    });
  };

  const handleRemoveFromTeam = (member: Member, teamId: string) => {
    setAreas(prev => {
      const sourceArea = prev.find(a => a.teams.some(t => t.id === teamId));
      const sourceIsSpecial = sourceArea && isSpecialArea(sourceArea.name);

      let nextAreas = prev.map(area => ({
        ...area,
        teams: area.teams.map(team => {
          if (team.id === teamId) {
            return { ...team, members: team.members.filter(m => m.id === member.id ? false : true) };
          }
          return team;
        })
      }));

      // If removed from a normal team, also remove from all special teams
      if (!sourceIsSpecial) {
        nextAreas = nextAreas.map(area => {
          if (isSpecialArea(area.name)) {
            return {
              ...area,
              teams: area.teams.map(team => ({
                ...team,
                members: team.members.filter(m => m.id !== member.id)
              }))
            };
          }
          return area;
        });
      }

      return nextAreas;
    });
  };

  const handleAddToSelectedTeam = (member: Member) => {
    if (!selectedTeamId) return;
    handleMoveMember(member.id, 'unassigned', selectedTeamId);
  };

  const handleSaveTeamSettings = (teamId: string, newReqs: Record<string, number>) => {
    setAreas(prev => prev.map(area => ({
      ...area,
      teams: area.teams.map(team => 
        team.id === teamId 
          ? { ...team, requirements: newReqs } 
          : team
      )
    })));
  };

  const handleConfirmSave = async () => {
    let setupToSave: SavedSetup;
    
    // Save all areas and teams as they are, including empty ones
    const savedAreas = JSON.parse(JSON.stringify(areas));

    if (currentSetupId) {
      setupToSave = {
        id: currentSetupId,
        name: currentSetupName,
        areas: savedAreas,
        unassignedMembers: [], // Sidebar pool is not saved in setup
        timestamp: Date.now(),
        memberSource: lastRefreshedSource || memberSource,
        creator: username
      };
    } else {
      const newId = `setup_${Date.now()}`;
      setupToSave = {
        id: newId,
        name: currentSetupName,
        areas: savedAreas,
        unassignedMembers: [],
        timestamp: Date.now(),
        memberSource: lastRefreshedSource || memberSource,
        creator: username
      };
      setCurrentSetupId(newId);
    }

    try {
      const response = await fetch(`/api/setups/${groupID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setupToSave)
      });

      if (response.ok) {
        setSavedSetups(prev => {
          const exists = prev.some(s => s.id === setupToSave.id);
          const newMetadata: SetupMetadata = {
            id: setupToSave.id,
            name: setupToSave.name,
            timestamp: setupToSave.timestamp,
            creator: setupToSave.creator || 'Unknown'
          };
          if (exists) {
            return prev.map(s => s.id === setupToSave.id ? newMetadata : s);
          }
          return [newMetadata, ...prev];
        });
        nhoThietLapDangMo(groupID, setupToSave.id);
        setIsSetupDropdownOpen(false);
      } else {
        console.error('Failed to save setup to server');
        if (showToast) showToast(t('setup.saveError'), 'error');
      }
    } catch (error) {
      console.error('Error saving setup:', error);
      if (showToast) showToast(t('setup.saveError'), 'error');
    }
  };

  const handleCreateNewSetup = () => {
    // Reset areas to the initial state defined in utils
    const translatedAreas = getTranslatedAreas(t);
    const resetAreas: Area[] = translatedAreas.map(area => ({
      ...area,
      teams: area.teams.map(team => ({
        ...team,
        members: [],
        requirements: { ...defaultReqs }
      }))
    }));

    setAreas(resetAreas);
    setCurrentSetupName(t('setup.newSetup'));
    setCurrentSetupId(null);
    nhoThietLapDangMo(groupID, null);   // chủ động mở bài mới thì F5 cũng ra bài mới
    setSelectedTeamId(null);
    setIsSetupDropdownOpen(false);
  };

  const handleLoadSetup = async (setupMetadata: SetupMetadata) => {
    try {
      const response = await fetch(`/api/setups/${groupID}/${setupMetadata.id}`);
      if (!response.ok) throw new Error('Failed to load setup');
      const setup: SavedSetup = await response.json();

      // 1. Create a lookup map from the CURRENT sidebar members to get the latest metadata
      const currentSidebarMap = new Map<string, Member>();
      unassignedMembers.forEach(m => currentSidebarMap.set(m.id, m));

      // 2. Map the saved areas/teams using live data from sidebar if available
      const newAreas = setup.areas.map(area => ({
        ...area,
        teams: area.teams.map(team => {
          // Migrate legacy position requirements to new IDs
          const migratedReqs = { ...team.requirements };
          if (migratedReqs['công']) { migratedReqs['pos_cong'] = migratedReqs['công']; delete migratedReqs['công']; }
          if (migratedReqs['thủ']) { migratedReqs['pos_thu'] = migratedReqs['thủ']; delete migratedReqs['thủ']; }
          // Note: we don't migrate 'flex' automatically because it could be a role or position.
          // New position requirements will use 'pos_flex'.
          
          return {
            ...team,
            requirements: migratedReqs,
            members: team.members.map(savedMember => {
              const liveMember = currentSidebarMap.get(savedMember.id);
              // Use live data if member exists in sidebar, otherwise fall back to saved data
              return liveMember ? { ...liveMember } : { ...savedMember };
            })
          };
        })
      }));

      // 3. Update ONLY areas state
      setAreas(newAreas);
      setCurrentSetupName(setup.name);
      setCurrentSetupId(setup.id);
      nhoThietLapDangMo(groupID, setup.id);
      if (setup.memberSource) {
        setMemberSource(setup.memberSource);
        setLastRefreshedSource(setup.memberSource);
      }
    } catch (error) {
      console.error('Error loading setup:', error);
    }
  };

  const handleDeleteSetup = async (e: React.MouseEvent, setupId: string) => {
    e.stopPropagation();
    
    try {
      const response = await fetch(`/api/setups/${groupID}/${setupId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setSavedSetups(prev => prev.filter(s => s.id !== setupId));
        if (currentSetupId === setupId) {
          setCurrentSetupId(null);
          nhoThietLapDangMo(groupID, null);   // xoá bài đang mở thì quên luôn, đừng để F5 đi tìm bài đã chết
        }
        return true;
      } else {
        console.error('Failed to delete setup from server');
        if (showToast) showToast(t('setup.deleteError'), 'error');
        return false;
      }
    } catch (error) {
      console.error('Error deleting setup:', error);
      if (showToast) showToast(t('setup.deleteError'), 'error');
      return false;
    }
  };

  const handleCopySetup = async (setupMetadata: SetupMetadata) => {
    try {
      const response = await fetch(`/api/setups/${groupID}/${setupMetadata.id}`);
      if (!response.ok) throw new Error('Failed to load setup');
      const setup: SavedSetup = await response.json();

      const newId = `setup_${Date.now()}`;
      const newSetup: SavedSetup = {
        ...setup,
        id: newId,
        name: `${setup.name} (copy)`,
        timestamp: Date.now(),
        creator: username
      };

      const saveResponse = await fetch(`/api/setups/${groupID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSetup)
      });

      if (saveResponse.ok) {
        setSavedSetups(prev => [
          { id: newSetup.id, name: newSetup.name, timestamp: newSetup.timestamp, creator: newSetup.creator || 'Unknown' },
          ...prev
        ]);
        return true;
      } else {
        console.error('Failed to copy setup to server');
        if (showToast) showToast(t('setup.duplicateError'), 'error');
        return false;
      }
    } catch (error) {
      console.error('Error copying setup:', error);
      if (showToast) showToast(t('setup.duplicateError'), 'error');
      return false;
    }
  };

  const refreshMembers = async (sourceOverride?: 'discord' | 'custom' | 'poll' | 'gvg', gvgIndex?: number, channelId?: string | string[], chiThanhVien = true) => {
    if (!groupID) {
      console.warn('Cannot refresh members: groupID is missing');
      return;
    }
    
    let source = sourceOverride || memberSource;
    if (!isConnected && (source === 'discord' || source === 'poll' || source === 'gvg')) {
      source = 'custom';
    }
    const gvgIdx = gvgIndex !== undefined ? gvgIndex : gvgOptionIndex;
    
    try {
      // Parallelize initial data fetching to reduce delay
      const fetchPromises: Promise<any>[] = [];
      
      // 1. Fetch members (Discord or Custom)
      const dsKenhVao = (Array.isArray(channelId) ? channelId : channelId ? [channelId] : []).filter(Boolean);
      // Nguồn bình chọn mà KHÔNG có kênh voice nào thì đừng gọi sang bên đó. Người vẫn lấy
      // đủ từ bảng bình chọn, còn gọi bừa là máy chủ tự đoán kênh rồi trả về một lỗi chẳng
      // liên quan gì tới việc người dùng vừa làm.
      const boQuaVoice = (source === 'poll' || source === 'gvg') && !dsKenhVao.length;

      if (boQuaVoice) {
        fetchPromises.push(Promise.resolve({ members: [] }));
      } else if (source === 'discord' || source === 'poll' || source === 'gvg') {
        const url = new URL(`/api/members/${groupID}`, window.location.origin);
        // Nhiều kênh: bang chiến chia sẵn voice công và voice thủ, đọc một kênh là thiếu nửa đội.
        if (dsKenhVao.length) {
          url.searchParams.append('channelIDs', dsKenhVao.join(','));
        }
        fetchPromises.push(fetch(url.toString()).then(async res => {
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const loi = `Lỗi lấy thành viên (${res.status}): ${errData.error || res.statusText}`;
            // Nguồn PHIẾU BẦU và GvG lấy người từ chính bảng bình chọn, kênh voice ở đây chỉ
            // là phần bù để có sẵn ảnh và tên. Kênh voice hỏng mà kéo chết cả lượt thì danh
            // sách người đăng ký trắng trơn, trong khi bảng bình chọn vẫn còn nguyên.
            // Ghi cảnh báo rồi đi tiếp, đừng ném.
            if (source === 'poll' || source === 'gvg') {
              console.warn('[refreshMembers] Bỏ qua kênh voice:', loi);
              return { members: [], canhBao: `${loi} Vẫn lấy được người từ bảng bình chọn.` };
            }
            throw new Error(loi);
          }
          return res.json();
        }));
      } else {
        fetchPromises.push(fetch(`/api/custom-members/${groupID}`).then(async res => {
          if (!res.ok) throw new Error('Không thể lấy danh sách thành viên đăng ký');
          return res.json();
        }));
      }
      
      // 2. Fetch member configs
      fetchPromises.push(fetch(`/api/members-config/${groupID}`).then(res => res.ok ? res.json() : {}));
      
      // 3. Fetch poll results if needed
      if (source === 'poll') {
        fetchPromises.push(fetch(`/api/poll/results/${groupID}`).then(res => res.ok ? res.json() : null));
      } else if (source === 'gvg' && gvgIdx !== null) {
        fetchPromises.push(fetch(`/api/poll/results/${groupID}?type=gvg`).then(res => res.ok ? res.json() : null));
      } else {
        fetchPromises.push(Promise.resolve(null));
      }

      const [membersData, memberConfigs, pollResultsData] = await Promise.all(fetchPromises);
      
      let fetchedMembers = Array.isArray(membersData) ? membersData : (membersData.members || []);
      // Có kênh hỏng giữa chừng thì vẫn lấy được người ở mấy kênh còn lại, nhưng phải nói ra,
      // không thì người dùng đếm thiếu người mà không hiểu vì sao.
      if (!Array.isArray(membersData) && membersData?.canhBao && showToast) {
        showToast(membersData.canhBao, 'info');
      }
      let pollResults: { continue: string[], backup: string[] } | null = source === 'poll' ? { continue: [], backup: [] } : null;
      let gvgResults: string[] | null = source === 'gvg' ? [] : null;

      if (source === 'poll' && pollResultsData) {
        const rawPollResults = pollResultsData;
        const allPollUsers = [...(rawPollResults.continue || []), ...(rawPollResults.backup || [])];
        const existingIds = new Set(fetchedMembers.map((m: any) => m.id));
        
        allPollUsers.forEach(u => {
          if (!existingIds.has(u.id)) {
            fetchedMembers.push(u);
            existingIds.add(u.id);
          }
        });

        pollResults = {
          continue: (rawPollResults.continue || []).map((u: any) => u.id),
          backup: (rawPollResults.backup || []).map((u: any) => u.id)
        };
      } else if (source === 'gvg' && gvgIdx !== null && pollResultsData) {
        const allResults = pollResultsData;
        if (allResults.options && allResults.options[gvgIdx]) {
          const optionUsers = allResults.options[gvgIdx].users || [];
          const existingIds = new Set(fetchedMembers.map((m: any) => m.id));
          optionUsers.forEach((u: any) => {
            if (!existingIds.has(u.id)) {
              fetchedMembers.push(u);
              existingIds.add(u.id);
            }
          });
          gvgResults = optionUsers.map((u: any) => u.id);
        }
      }

      // Batch fetch profiles to avoid N+1 requests
      const namesToFetch = fetchedMembers.map((m: any) => m.name);
      let profilesMap = new Map();
      
      try {
        const profilesRes = await fetch(`/api/member-profiles/${groupID}/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ names: namesToFetch })
        });
        
        if (profilesRes.ok) {
          const profiles = await profilesRes.json();
          if (Array.isArray(profiles)) {
            profiles.forEach((p: any) => {
              if (p && p.name) {
                profilesMap.set(p.name.toLowerCase(), p);
              }
            });
          }
        }
      } catch (e) {
        console.error('Failed to fetch batch profiles:', e);
      }

      let membersWithProfiles = fetchedMembers.map((m: any) => {
        const profile = profilesMap.get(m.name.toLowerCase());
        if (profile) {
          const { id, name, avatar, ...restProfile } = profile;
          return { ...m, ...restProfile };
        }
        return m;
      });

      // TRA BẢN GHI ĐÃ LƯU THEO DISCORD ID, KHÔNG CHỈ THEO KHOÁ.
      // Người lấy từ voice mang id là Discord ID thật, còn bản ghi đã lưu của chính người đó
      // có thể mang khoá 'custom_<thời điểm>' (sinh ra khi thêm tay lúc bot chưa tra được).
      // Tra thẳng theo id là trượt, hậu quả kép: tool hiểu thành HAI người khác nhau, và
      // người "mới" hiện ra trống trơn, không vai trò không vũ khí không tên trong game.
      // Khớp được thì dùng luôn KHOÁ CŨ làm id, để mọi thứ đã lưu theo khoá đó (vai trò,
      // vũ khí, thống kê, bài xếp cũ) vẫn trỏ đúng người, và không đẻ thêm bản ghi trùng.
      const theoDiscordId = new Map<string, { id: string; config: any }>();
      for (const [rid, c] of Object.entries<any>(memberConfigs || {})) {
        const did = c?.discordId || (/^\d{17,19}$/.test(rid) ? rid : '');
        if (did && !theoDiscordId.has(did)) theoDiscordId.set(did, { id: rid, config: c });
      }

      // LỌC NGƯỜI LẠ RA KHỎI NGUỒN VOICE.
      // Kênh voice trả về mọi người đang ngồi trong đó, kể cả người tạt vào nghe chơi. Họ
      // không có trong danh sách bang nhưng vẫn hiện ra như một tuyển thủ, và tệ hơn là
      // "Xếp theo voice" thả luôn họ vào đội.
      // Chỉ lọc ở nguồn voice. Poll và GvG thì người bỏ phiếu chính là người cần lấy, lọc
      // vào đó là mất người.
      const coTrongDs = (dm: any) => !!(memberConfigs[dm.id] || theoDiscordId.get(dm.discordId || dm.id));
      let soKhach = 0;
      if (source === 'discord') {
        soKhach = membersWithProfiles.filter((m: any) => !coTrongDs(m)).length;
        if (chiThanhVien) membersWithProfiles = membersWithProfiles.filter(coTrongDs);
      }
      // Nói ra số người bị bỏ. Im lặng lọc là người dùng đếm thiếu người mà không hiểu vì sao,
      // nhất là khi người thật sự mới vào bang cũng bị lọc cùng.
      if (soKhach && chiThanhVien && showToast) {
        showToast(t('sidebar.voice.skippedGuests', { n: soKhach }), 'info');
      }

      const newMembersDataMap = new Map();
      membersWithProfiles.forEach((dm: any) => {
        const khop = memberConfigs[dm.id]
          ? { id: dm.id, config: memberConfigs[dm.id] }
          : theoDiscordId.get(dm.discordId || dm.id);
        const config = khop?.config || {};
        const memberId = khop?.id || dm.id;
        
        // Bản ghi lưu vũ khí và cấp bậc ở HAI DẠNG tuỳ đường nào tạo ra nó: nút "Thêm thành
        // viên" lưu nguyên object (primaryWeapon1.id), còn thẻ thành viên bấm Lưu mới ghi
        // thêm dạng id rời (primaryWeapon1Id). Bản cũ chỉ đọc dạng id rời nên người thêm
        // bằng nút kia mở ra thấy trống vũ khí và cấp bậc Tân Binh, tưởng mất dữ liệu.
        // Luôn tra lại theo id để lấy ĐỊNH NGHĨA HIỆN TẠI (tên, icon), object lưu trong DB
        // chỉ là ảnh chụp cũ; tra không ra mới dùng tạm object đó.
        const timVK = (id?: string) => (id ? Object.values(WEAPONS).find((w) => w.id === id) : undefined);
        const timRank = (id?: string) => (id ? Object.values(RANKS).find((r) => r.id === id) : undefined);

        const primaryWeapon1 = dm.primaryWeapon1
          || timVK(config.primaryWeapon1Id) || timVK(config.primaryWeapon1?.id) || config.primaryWeapon1 || WEAPONS.NONE;
        const primaryWeapon2 = dm.primaryWeapon2
          || timVK(config.primaryWeapon2Id) || timVK(config.primaryWeapon2?.id) || config.primaryWeapon2 || WEAPONS.NONE;
        const idPhu: string[] = (config.secondaryWeaponIds?.length
          ? config.secondaryWeaponIds
          : (config.secondaryWeapons || []).map((w: any) => w?.id)).filter(Boolean);
        const secondaryWeapons = dm.secondaryWeapons
          || idPhu.map((id: string) => timVK(id)).filter(Boolean);
        const rank = dm.rank
          || timRank(config.rankId) || timRank(config.rank?.id) || config.rank || Object.values(RANKS)[0];

        let participationStatus = dm.participationStatus || 'confirmed';
        if (source === 'poll' && pollResults) {
          if (pollResults.backup.includes(dm.id)) {
            participationStatus = 'backup';
          } else if (pollResults.continue.includes(dm.id)) {
            participationStatus = 'confirmed';
          } else {
            participationStatus = 'none';
          }
        }

        // ⚠️ ĐÂY LÀ DANH SÁCH TRƯỜNG CỐ ĐỊNH, KHÔNG PHẢI SPREAD.
        // Thêm trường mới vào model mà quên thêm ở đây là nó bị vứt im lặng ngay tại chỗ:
        // API trả về đủ, nhưng tới tay giao diện thì mất. discordId đã dính đúng bẫy này,
        // vá tận API rồi mà mention vẫn không hiện, vì nó chết ở dòng dưới.
        newMembersDataMap.set(memberId, {
          id: memberId,
          // Giữ Discord ID thật kể cả khi id là khoá 'custom_...', để mention và tra Discord
          // sau này vẫn có cái mà dùng.
          discordId: dm.discordId || config.discordId || (/^\d{17,19}$/.test(dm.id) ? dm.id : undefined),
          voiceChannelId: dm.voiceChannelId,
          voiceChannelName: dm.voiceChannelName,
          // Người trong voice mà không có bản ghi nào trong danh sách bang. Đánh dấu để lúc
          // tắt bộ lọc vẫn nhìn ra ngay ai là khách, khỏi xếp nhầm họ vào đội.
          laKhach: source === 'discord' && !khop,
          name: normalizeDiscordName(dm.name),
          avatar: dm.avatar,
          ingameName: dm.ingameName || config.ingameName || '',
          ingameId: dm.ingameId || config.ingameId || '',
          role: dm.role || config.role || '',
          position: dm.position || config.position || '',
          positions: dm.positions || config.positions || [],
          primaryWeapon1,
          primaryWeapon2,
          secondaryWeapons,
          secondaryWeapon1: dm.secondaryWeapon1 || WEAPONS.NONE,
          secondaryWeapon2: dm.secondaryWeapon2 || WEAPONS.NONE,
          stats: dm.stats || config.stats,
          rank,
          registration: dm.registration || 'none',
          participationStatus,
          note: dm.note || config.note || '',
          source: source,
          type: dm.type || config.type || 0,
          matchStats: dm.matchStats || config.matchStats || {
            League: { Win: 0, Lose: 0 },
            Rated: { Win: 0, Lose: 0 },
            Scrim: { Win: 0, Lose: 0 }
          }
        });
      });

      // 1. Update metadata for members ALREADY in teams (keep them updated)
      setAreas(prevAreas => prevAreas.map(area => ({
        ...area,
        teams: area.teams.map(team => ({
          ...team,
          members: team.members.map(m => {
            const newData = newMembersDataMap.get(m.id);
            return newData ? { ...m, ...newData } : m;
          })
        }))
      })));

      // 2. Set unassigned members to ALL fetched members
      const newUnassigned: Member[] = [];
      newMembersDataMap.forEach((data, id) => {
        if (source === 'poll' && data.participationStatus === 'none') {
          return;
        }
        // Danh sách người bỏ phiếu là DISCORD ID, còn khoá ở đây có thể là 'custom_<thời
        // điểm>' của bản ghi đã lưu (từ lúc tôi cho khớp người theo discordId để khỏi đẻ ra
        // hai bản cho cùng một người). So mỗi khoá là hụt đúng những người ĐÃ CÓ trong danh
        // sách bang, còn người lạ thì lại hiện, ngược hoàn toàn với lẽ thường.
        // Triệu chứng: lựa chọn có 3 phiếu mà danh sách trống trơn.
        if (source === 'gvg' && gvgResults
          && !gvgResults.includes(id) && !(data.discordId && gvgResults.includes(data.discordId))) {
          return;
        }
        newUnassigned.push({
          id,
          ...data,
          status: 'online',
          isConfirmed: false
        });
      });

      // GỘP BẢN GHI TRÙNG NGƯỜI.
      // DB có thể chứa HAI bản ghi cho cùng một người: thêm tay hai lần là hai khoá
      // 'custom_<thời điểm>' khác nhau, cùng một discordId. Đo thật trên máy chủ thấy đúng
      // như vậy. Không gộp thì danh sách hiện hai thẻ giống hệt nhau, và tệ hơn là bản này
      // đứng trong đội rồi mà bản kia vẫn bị "Xếp theo voice" thả thêm vào đội khác.
      // Giữ bản ĐANG ĐƯỢC DÙNG trong đội hình nếu có, để bài xếp cũ không trỏ vào khoảng không.
      const dangTrongDoi = new Set<string>();
      areas.forEach((a) => a.teams.forEach((t) => t.members.forEach((m) => dangTrongDoi.add(m.id))));
      const theoNguoi = new Map<string, Member>();
      for (const m of newUnassigned) {
        const khoa = m.discordId || m.id;
        const cu = theoNguoi.get(khoa);
        if (!cu || (!dangTrongDoi.has(cu.id) && dangTrongDoi.has(m.id))) theoNguoi.set(khoa, m);
      }

      setUnassignedMembers([...theoNguoi.values()]);
      setLastRefreshedSource(source);
    } catch (error: any) {
      console.error('Refresh members error:', error);
      if (showToast) {
        showToast(error.message || 'Lỗi khi lấy danh sách thành viên', 'error');
      }
    }
  };

  const clearUnassignedMembers = () => {
    setUnassignedMembers([]);
  };

  /**
   * Thả người vào khu theo kênh voice họ đang ngồi.
   *
   * Nguyên tắc: KHÔNG ĐỤNG vào ai đã đứng trong đội. Người xếp có thể đã cất công kéo tay
   * vài người, bấm nút này mà xáo lại từ đầu là mất công họ.
   * Trong một khu thì luôn thả vào đội ĐANG ÍT NGƯỜI NHẤT, nên Công 1/2/3 tự chia đều mà
   * không cần khai báo sức chứa. Chia xong vẫn kéo lại tay được nếu muốn khác.
   *
   * Ai ngồi kênh chưa gán khu, hoặc không ở voice nào, thì để nguyên ngoài danh sách chờ
   * chứ không đoán bừa. Trả về số liệu để chỗ gọi báo cho người dùng biết còn sót ai.
   */
  const handleXepTheoVoice = (gan: Record<string, string>) => {
    // Nhận diện người đã đứng trong đội bằng CẢ id LẪN discordId.
    // Chỉ so id là hụt: cùng một người có thể mang hai khoá khác nhau (hai bản ghi trùng
    // trong DB, hoặc bản lấy từ voice mang khoá khác bản đã kéo tay). Hụt một cái là thả
    // thêm một bản sao nữa vào đội, đúng lỗi "Naiel ở cả Công 1 lẫn Công 2".
    const daXep = new Set<string>();
    areas.forEach((a) => a.teams.forEach((t) => t.members.forEach((m) => {
      daXep.add(m.id);
      if (m.discordId) daXep.add(m.discordId);
    })));

    const theoKhu = new Map<string, Member[]>();
    let boQua = 0;
    let daTrongDoi = 0;
    let khach = 0;
    for (const m of unassignedMembers) {
      if (daXep.has(m.id) || (m.discordId && daXep.has(m.discordId))) { daTrongDoi++; continue; }
      // Không tự thả khách vào đội, kể cả khi người dùng tắt bộ lọc để nhìn cho đủ. Tắt lọc
      // là để XEM ai đang trong voice, không phải để xếp họ ra trận. Muốn dùng thì kéo tay.
      if (m.laKhach) { khach++; continue; }
      const areaId = m.voiceChannelId ? gan[m.voiceChannelId] : undefined;
      if (!areaId) { boQua++; continue; }
      if (!theoKhu.has(areaId)) theoKhu.set(areaId, []);
      theoKhu.get(areaId)!.push(m);
    }

    // Dựng KẾ HOẠCH trước rồi mới đặt state. Đếm ngay trong hàm cập nhật state là sai:
    // React gọi hàm đó nhiều lần (StrictMode gọi hai lần), số đếm nhân đôi.
    const keHoach = new Map<string, Member[]>();
    let daThem = 0;
    for (const area of areas) {
      const ds = theoKhu.get(area.id);
      if (!ds?.length || !area.teams.length) continue;
      const dem = area.teams.map((t) => t.members.length);
      for (const m of ds) {
        let it = 0;
        for (let i = 1; i < dem.length; i++) if (dem[i] < dem[it]) it = i;
        const tid = area.teams[it].id;
        if (!keHoach.has(tid)) keHoach.set(tid, []);
        keHoach.get(tid)!.push(m);
        dem[it]++;
        daThem++;
      }
    }

    if (daThem) {
      setAreas((prev) => prev.map((area) => ({
        ...area,
        teams: area.teams.map((t) => {
          const them = keHoach.get(t.id);
          return them?.length
            ? { ...t, members: [...t.members, ...them.map((m) => ({ ...m, isConfirmed: false }))] }
            : t;
        }),
      })));
    }

    // Trả đủ số liệu để chỗ gọi phân biệt được BA lý do "không xếp được ai", vì mỗi lý do
    // cần một cách sửa khác nhau: danh sách rỗng (chưa ai vào voice), ai cũng đã đứng trong
    // đội rồi, hay có người nhưng ngồi ở kênh chưa gán khu. Gộp chung một câu là người dùng
    // đi sửa nhầm chỗ.
    return { daThem, boQua, khach, soKhu: theoKhu.size, tongCho: unassignedMembers.length, daTrongDoi };
  };
  
  const handleDeleteCustomMember = async (memberId: string) => {
    try {
      const res = await fetch(`/api/custom-members/${groupID}/${memberId}`, { method: 'DELETE' });
      if (res.ok) {
        // Remove from unassigned
        setUnassignedMembers(prev => prev.filter(m => m.id !== memberId));
        // Remove from all teams
        setAreas(prev => prev.map(a => ({
          ...a,
          teams: a.teams.map(t => ({
            ...t,
            members: t.members.filter(m => m.id !== memberId)
          }))
        })));

      } else {
        console.error('Failed to delete member:', await res.text());
      }
    } catch (e) {
      console.error('Error in handleDeleteCustomMember:', e);
    }
  };

  const [isCheckingOnline, setIsCheckingOnline] = useState(false);

  const handleCheckOnline = async () => {
    setIsCheckingOnline(true);
    try {
      const unassignedIds = new Set(unassignedMembers.map(m => m.id));

      const newAreas = areas.map(area => ({
        ...area,
        teams: area.teams.map(team => ({
          ...team,
          members: team.members.map(m => ({
            ...m,
            status: unassignedIds.has(m.id) ? 'online' : 'offline'
          }))
        }))
      }));

      setAreas(newAreas);
      return newAreas;

    } catch (error: any) {
      console.error('Check online error:', error);
      return areas;
    } finally {
      setIsCheckingOnline(false);
    }
  };

  const handleConfirmMatchResult = async (type: 'League' | 'Rated' | 'Scrim', result: 'Win' | 'Lose') => {
    const membersToUpdate: Member[] = [];
    areas.forEach(area => {
      area.teams.forEach(team => {
        team.members.forEach(member => {
          membersToUpdate.push(member);
        });
      });
    });

    if (membersToUpdate.length === 0) return;

    const updatedMembers = membersToUpdate.map(m => {
      const currentStats = m.matchStats || {
        League: { Win: 0, Lose: 0 },
        Rated: { Win: 0, Lose: 0 },
        Scrim: { Win: 0, Lose: 0 }
      };
      return {
        ...m,
        matchStats: {
          ...currentStats,
          [type]: {
            ...currentStats[type],
            [result]: currentStats[type][result] + 1
          }
        }
      };
    });

    setAreas(prev => prev.map(area => ({
      ...area,
      teams: area.teams.map(team => ({
        ...team,
        members: team.members.map(m => {
          const updated = updatedMembers.find(um => um.id === m.id);
          return updated || m;
        })
      }))
    })));

    try {
      const response = await fetch(`/api/members-config/${groupID}`);
      if (!response.ok) throw new Error('Failed to load member configs');
      const contentType = response.headers.get('content-type');
      const configs = (contentType && contentType.includes('application/json')) ? await response.json() : {};
      
      updatedMembers.forEach(localMember => {
        configs[localMember.id] = {
          role: localMember.role,
          position: localMember.position,
          primaryWeapon1Id: localMember.primaryWeapon1.id,
          primaryWeapon2Id: localMember.primaryWeapon2.id,
          secondaryWeaponIds: localMember.secondaryWeapons.map(w => w.id),
          rankId: localMember.rank.id,
          note: localMember.note,
          stats: localMember.stats,
          matchStats: localMember.matchStats,
          type: localMember.type
        };
      });

      await fetch(`/api/members-config/${groupID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configs)
      });
    } catch (error) {
      console.error("Failed to save match results:", error);
      if (showToast) showToast(t('setup.confirmResultError'), 'error');
      throw error;
    }
  };

  const handleUpdateMember = async (updatedMember: Member) => {
    handleUpdateUnassignedMember(updatedMember);
    handleUpdateSetupMember(updatedMember);
  };

  return {
    unassignedMembers,
    setUnassignedMembers,
    areas,
    setAreas,
    savedSetups,
    setSavedSetups,
    isSetupDropdownOpen,
    setIsSetupDropdownOpen,
    currentSetupName,
    setCurrentSetupName,
    currentSetupId,
    setCurrentSetupId,
    selectedTeamId,
    setSelectedTeamId,
    memberSource,
    setMemberSource,
    lastRefreshedSource,
    isCheckingOnline,
    handleCheckOnline,
    activePoll,
    activeGvgPoll,
    handleCreatePoll,
    handleCreateGvGPoll,
    handleClosePoll,
    handleCloseGvgPoll,
    handleRepostPoll,
    handleAddArea,
    handleDeleteArea,
    handleRenameArea,
    handleAddTeam,
    handleDeleteTeam,
    handleRenameTeam,
    handleUpdateUnassignedMember,
    handleUpdateSetupMember,
    handleUpdateMember,
    handleConfirmAllAssigned,
    handleClearTeamMembers,
    handleClearAreaMembers,
    handleMoveMember,
    handleMoveTeam,
    handleRemoveFromTeam,
    handleAddToSelectedTeam,
    handleSaveTeamSettings,
    handleConfirmSave,
    handleCreateNewSetup,
    handleLoadSetup,
    handleDeleteSetup,
    handleCopySetup,
    refreshMembers,
    clearUnassignedMembers,
    handleXepTheoVoice,
    handleDeleteCustomMember,
    gvgPollOptions,
    setGvgPollOptions,
    gvgOptionIndex,
    setGvgOptionIndex,
    handleConfirmMatchResult
  };
}
