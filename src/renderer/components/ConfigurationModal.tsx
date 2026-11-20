// src/renderer/components/ConfigurationModal.tsx - Comprehensive Business & Global Configuration
import React, { useState, useEffect, useRef } from 'react';
import { CompanySettings, AppSettings, Company, NumberingSequence } from '../../shared/types';
import { api, setLocalDeviceIdentity, setSessionAdminPin, getSessionAdminPin } from '../services/api';
import { ModalPortal } from './ModalPortal';
import {
  Settings,
  DollarSign,
  FileText,
  Package,
  Server,
  X,
  Save,
  CheckCircle,
  Image as ImageIcon,
  FolderOpen,
  ListOrdered,
  FileCheck,
  Check,
  AlertCircle,
  RefreshCw,
  RotateCcw,
  Upload,
  Loader2,
  Building2,
  Monitor,
  Trash2,
  Shield,
  Lock,
  Users,
  ChevronDown,
  ChevronUp,
  Plus,
  KeyRound,
  Activity,
  HardDrive,
  Download,
  Copy,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  companyId?: string | null;
  onOpenCompanyModal?: () => void;
}

export const ConfigurationModal: React.FC<Props> = ({ isOpen, onClose, companyId, onOpenCompanyModal }) => {
  const [activeCategory, setActiveCategory] = useState<string>(companyId ? 'Business_Settings' : 'Deployment_Mode');
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [sequences, setSequences] = useState<NumberingSequence[]>([]);
  const [editingSeqId, setEditingSeqId] = useState<string | null>(null);
  const [seqFormData, setSeqFormData] = useState<Partial<NumberingSequence>>({});

  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const [resetting, setResetting] = useState<boolean>(false);
  const [iconSaving, setIconSaving] = useState<boolean>(false);
  const [iconStatus, setIconStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Interactive Software Icon Calibrator State
  const [iconSourceImg, setIconSourceImg] = useState<HTMLImageElement | null>(null);
  const [iconNaturalDims, setIconNaturalDims] = useState<{ width: number; height: number } | null>(null);
  const [iconFitMode, setIconFitMode] = useState<'COVER' | 'CONTAIN'>('COVER');
  const [iconZoom, setIconZoom] = useState<number>(1);
  const [iconOffsetX, setIconOffsetX] = useState<number>(0);
  const [iconOffsetY, setIconOffsetY] = useState<number>(0);
  const [iconRounded, setIconRounded] = useState<boolean>(true);
  const [iconBgColor, setIconBgColor] = useState<string>('transparent');
  const [calibratedIconPreview, setCalibratedIconPreview] = useState<string | null>(null);
  const iconDragRef = useRef<{ startX: number; startY: number; origOffX: number; origOffY: number } | null>(null);

  // Direct Desktop-to-Desktop LAN Connect state (per-PC Electron config)
  const [lanRole, setLanRole] = useState<'STANDALONE' | 'LAN_HOST' | 'LAN_CLIENT'>('STANDALONE');
  const [lanHostIp, setLanHostIp] = useState<string>('');
  const [lanPort, setLanPort] = useState<number>(4200);
  const [lanDeviceId, setLanDeviceId] = useState<string>('');
  const [lanDeviceName, setLanDeviceName] = useState<string>('');
  const [lanStaffName, setLanStaffName] = useState<string>('');
  const [lanMinimizeToTray, setLanMinimizeToTray] = useState<boolean>(true);
  const [lanAutoStartOnBoot, setLanAutoStartOnBoot] = useState<boolean>(false);
  const [lanLocalIps, setLanLocalIps] = useState<string[]>([]);
  const [lanConnectedUrl, setLanConnectedUrl] = useState<string>('');
  const [isElectronDesktop, setIsElectronDesktop] = useState<boolean>(false);
  const [lanTesting, setLanTesting] = useState<boolean>(false);
  const [lanSaving, setLanSaving] = useState<boolean>(false);
  const [lanStatus, setLanStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedIp, setCopiedIp] = useState<string>('');

  // Host Staff Creation & Permissions state
  const [hostNewStaffName, setHostNewStaffName] = useState<string>('');
  const [hostNewStaffMenus, setHostNewStaffMenus] = useState<string[]>([
    'invoices',
    'invoices_other',
    'quotations',
    'customers',
    'suppliers',
    'products',
    'purchases',
    'inventory',
    'payments',
  ]);
  const [hostNewStaffCanSettings, setHostNewStaffCanSettings] = useState<boolean>(false);
  const [hostCreatingStaff, setHostCreatingStaff] = useState<boolean>(false);
  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null);

  // MD / Admin Menu Permissions state
  const [permLoading, setPermLoading] = useState<boolean>(false);
  const [permHasAdminPin, setPermHasAdminPin] = useState<boolean>(true);
  const [permHasCustomPin, setPermHasCustomPin] = useState<boolean>(false);
  const [permUnlocked, setPermUnlocked] = useState<boolean>(false);
  const [permPinInput, setPermPinInput] = useState<string>('');
  const [permCurrentPin, setPermCurrentPin] = useState<string>('');
  const [permNewPin, setPermNewPin] = useState<string>('');
  const [permWorkstations, setPermWorkstations] = useState<any[]>([]);
  const [permDefaultStaffMenus, setPermDefaultStaffMenus] = useState<string[]>([]);
  const [permMenuCatalog, setPermMenuCatalog] = useState<{ id: string; label: string; group: string }[]>([]);
  const [permPresets, setPermPresets] = useState<Record<string, any>>({});
  const [permStatus, setPermStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [permSavingId, setPermSavingId] = useState<string | null>(null);

  // 4-Digit PIN Authorization Modal state
  const [pinPromptState, setPinPromptState] = useState<{
    type: 'CREATE_STAFF' | 'SAVE_STAFF' | 'DELETE_STAFF';
    title: string;
    description: string;
    data?: any;
  } | null>(null);
  const [pinPromptInput, setPinPromptInput] = useState<string>('');
  const [pinPromptError, setPinPromptError] = useState<string>('');
  const [pinPromptLoading, setPinPromptLoading] = useState<boolean>(false);

  // System Diagnostics state
  const [diagnosticsDownloading, setDiagnosticsDownloading] = useState<boolean>(false);

  // Offline Software Updater & Multi-PC Synchronization state
  const [updateInstalling, setUpdateInstalling] = useState<boolean>(false);
  const [updateStatus, setUpdateStatus] = useState<{ success: boolean; message: string; backupPath?: string } | null>(null);
  const [lanUpdating, setLanUpdating] = useState<boolean>(false);
  const [exportingPackage, setExportingPackage] = useState<boolean>(false);
  const updateFileInputRef = useRef<HTMLInputElement | null>(null);

  // Database persistence info for diagnostics
  const [dbModeInfo, setDbModeInfo] = useState<any>(null);

  const loadDiagnosticsData = async () => {
    try {
      const dbMode = await api.getDatabaseMode().catch(() => null);
      if (dbMode) setDbModeInfo(dbMode);
    } catch {
      // ignore
    }
  };

  const handleExportDiagnostics = () => {
    setDiagnosticsDownloading(true);
    try {
      const url = api.getDiagnosticsDownloadUrl();
      window.open(url, '_blank');
    } catch (err: any) {
      alert('Could not download diagnostics: ' + err.message);
    } finally {
      setTimeout(() => setDiagnosticsDownloading(false), 1500);
    }
  };

  const handleInstallOfflineUpdate = async (file?: File) => {
    setUpdateInstalling(true);
    setUpdateStatus(null);
    try {
      const electronAPI = (window as any)?.electronAPI;
      if (electronAPI?.installOfflineUpdate && !file) {
        const res = await electronAPI.installOfflineUpdate();
        if (res?.cancelled) {
          setUpdateInstalling(false);
          return;
        }
        if (res?.success) {
          setUpdateStatus({ success: true, message: res.message, backupPath: res.backupPath });
        } else {
          setUpdateStatus({ success: false, message: res?.error || 'Failed to install update.' });
        }
      } else if (file) {
        const fd = new FormData();
        fd.append('updateFile', file);
        const res = await api.installOfflineUpdateWeb(fd);
        if (res.success) {
          setUpdateStatus({ success: true, message: res.message, backupPath: res.backupPath });
        } else {
          setUpdateStatus({ success: false, message: 'Failed to install update.' });
        }
      }
    } catch (err: any) {
      setUpdateStatus({ success: false, message: err?.message || 'Error applying update.' });
    } finally {
      setUpdateInstalling(false);
    }
  };

  const handleUpdateFromLan = async () => {
    setLanUpdating(true);
    setUpdateStatus(null);
    try {
      const electronAPI = (window as any)?.electronAPI;
      if (electronAPI?.updateFromLan) {
        const res = await electronAPI.updateFromLan();
        if (res?.success) {
          setUpdateStatus({ success: true, message: res.message, backupPath: res.backupPath });
        } else {
          setUpdateStatus({ success: false, message: res?.error || 'Failed to update from Main Office PC.' });
        }
      } else {
        alert('Direct LAN update is supported in desktop mode.');
      }
    } catch (err: any) {
      setUpdateStatus({ success: false, message: err?.message || 'Error updating from Main PC.' });
    } finally {
      setLanUpdating(false);
    }
  };

  const handleExportUpdatePackage = async () => {
    setExportingPackage(true);
    try {
      const electronAPI = (window as any)?.electronAPI;
      if (electronAPI?.exportUpdatePackage) {
        const res = await electronAPI.exportUpdatePackage();
        if (res?.success) {
          alert('Update package folder exported and opened in Windows Explorer: ' + res.path);
        } else {
          alert('Could not export update package: ' + (res?.error || 'Unknown error'));
        }
      } else {
        window.open(api.getUpdateBundleDownloadUrl(), '_blank');
      }
    } catch (err: any) {
      alert('Error exporting update package: ' + err.message);
    } finally {
      setExportingPackage(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (
        !companyId &&
        activeCategory !== 'Deployment_Mode' &&
        activeCategory !== 'Factory_Reset' &&
        activeCategory !== 'Software_Icon'
      ) {
        setActiveCategory('Deployment_Mode');
      }
      setIconStatus(null);
      loadAllSettings();
    }
  }, [isOpen, companyId]);

  const loadAllSettings = async () => {
    setLoading(true);
    setError('');
    try {
      loadDiagnosticsData();
      try {
        const as = await api.getAppSettings();
        setAppSettings(as);
      } catch (e: any) {
        console.warn('Could not load app settings:', e);
      }

      // Load Direct Desktop-to-Desktop LAN configuration (Electron IPC or local network-info fallback)
      try {
        const electronAPI = (window as any)?.electronAPI;
        if (electronAPI?.getLanConfig) {
          const info = await electronAPI.getLanConfig();
          setIsElectronDesktop(true);
          setLanRole(info?.config?.role || 'STANDALONE');
          setLanHostIp(info?.config?.hostIp || '');
          setLanPort(Number(info?.config?.port) || 4200);
          setLanDeviceId(info?.config?.deviceId || '');
          setLanDeviceName(info?.config?.deviceName || '');
          setLanStaffName(info?.config?.staffName || '');
          setLanMinimizeToTray(info?.config?.minimizeToTray !== false);
          setLanAutoStartOnBoot(Boolean(info?.config?.autoStartOnBoot));
          setLanLocalIps(Array.isArray(info?.localIps) ? info.localIps : []);
          setLanConnectedUrl(info?.connectedUrl || '');
        } else {
          setIsElectronDesktop(false);
          try {
            setLanDeviceId(localStorage.getItem('eim_device_id') || '');
            setLanDeviceName(localStorage.getItem('eim_device_name') || 'Office PC');
            setLanStaffName(localStorage.getItem('eim_staff_name') || '');
          } catch {
            // ignore
          }
          const netInfo = await api.getNetworkInfo().catch(() => null);
          if (netInfo) {
            setLanLocalIps(Array.isArray(netInfo.localIps) ? netInfo.localIps : []);
            setLanPort(Number(netInfo.serverPort) || 4200);
            if (netInfo.serverHost === '0.0.0.0') {
              setLanRole('LAN_HOST');
            }
          }
        }
      } catch (lanErr) {
        console.warn('Could not load LAN config:', lanErr);
      }

      if (companyId) {
        const [csRes, compRes, seqRes] = await Promise.allSettled([
          api.getCompanySettings(companyId),
          api.getCompany(companyId),
          api.getSequences(companyId),
        ]);
        if (csRes.status === 'fulfilled') setCompanySettings(csRes.value);
        if (compRes.status === 'fulfilled') setCompany(compRes.value);
        if (seqRes.status === 'fulfilled') setSequences(seqRes.value);
      } else {
        setCompanySettings(null);
        setCompany(null);
        setSequences([]);
      }
    } catch (err: any) {
      console.error('Error loading configuration:', err);
      setError(err?.message || 'Error loading configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      if (companyId && companySettings) {
        await api.updateCompanySettings(companyId, {
          ...companySettings,
          invoice_overdue_days: Number(companySettings.invoice_overdue_days) || 0,
          quotation_validity_days: Number(companySettings.quotation_validity_days) || 30,
        });
      }
      if (appSettings) {
        await api.updateAppSettings({
          ...appSettings,
        });
      }
      if (company) {
        await api.updateCompany(company.id, company);
      }
      if (activeCategory === 'Deployment_Mode') {
        try {
          await handleSaveLanDesktopConfig(false);
        } catch {
          // ignore
        }
      }
      setSavedSuccess(true);
      window.dispatchEvent(new Event('eim-permissions-changed'));
      onClose();
    } catch (err: any) {
      console.error('Error saving settings:', err);
      alert('Error saving settings: ' + (err?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const updateCompanySetting = <K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) => {
    setCompanySettings((prev) => (prev ? { ...prev, [key]: value } : null));
  };

  const updateAppSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setAppSettings((prev) => (prev ? { ...prev, [key]: value } : null));
  };

  const updateCompanyField = <K extends keyof Company>(key: K, value: Company[K]) => {
    setCompany((prev) => (prev ? { ...prev, [key]: value } : null));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !company) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      updateCompanyField('logo_url', base64);
    };
    reader.readAsDataURL(file);
  };

  const handleClearLogo = () => {
    updateCompanyField('logo_url', '');
  };

  const renderCalibratedIconDataUrl = (
    img: HTMLImageElement,
    fitMode: 'COVER' | 'CONTAIN',
    zoom: number,
    offX: number,
    offY: number,
    rounded: boolean,
    bgColor: string
  ): string => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.clearRect(0, 0, size, size);
    ctx.save();

    if (rounded) {
      const r = 48; // Matches rounded-lg proportions (6px on 32px icon -> 48px on 256px)
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(size - r, 0);
      ctx.quadraticCurveTo(size, 0, size, r);
      ctx.lineTo(size, size - r);
      ctx.quadraticCurveTo(size, size, size - r, size);
      ctx.lineTo(r, size);
      ctx.quadraticCurveTo(0, size, 0, size - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
      ctx.clip();
    }

    if (bgColor && bgColor !== 'transparent') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, size, size);
    }

    const baseScale =
      fitMode === 'COVER'
        ? Math.max(size / img.width, size / img.height)
        : Math.min(size / img.width, size / img.height);
    const scale = baseScale * zoom;
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const x = (size - drawW) / 2 + offX;
    const y = (size - drawH) / 2 + offY;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x, y, drawW, drawH);
    ctx.restore();

    return canvas.toDataURL('image/png');
  };

  useEffect(() => {
    if (!iconSourceImg) {
      setCalibratedIconPreview(null);
      return;
    }
    const url = renderCalibratedIconDataUrl(
      iconSourceImg,
      iconFitMode,
      iconZoom,
      iconOffsetX,
      iconOffsetY,
      iconRounded,
      iconBgColor
    );
    setCalibratedIconPreview(url);
  }, [iconSourceImg, iconFitMode, iconZoom, iconOffsetX, iconOffsetY, iconRounded, iconBgColor]);

  const handleSoftwareIconFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIconStatus(null);
    const reader = new FileReader();
    reader.onerror = () => {
      setIconStatus({ type: 'error', message: 'Could not read the selected image file.' });
    };
    reader.onload = () => {
      const src = String(reader.result || '');
      const img = new Image();
      img.onerror = () => {
        setIconStatus({
          type: 'error',
          message: 'Unsupported or corrupted image file. Please choose a PNG, JPG, WebP, SVG, or ICO image.',
        });
      };
      img.onload = () => {
        setIconNaturalDims({ width: img.width, height: img.height });
        setIconSourceImg(img);
        setIconFitMode('COVER');
        setIconZoom(1);
        setIconOffsetX(0);
        setIconOffsetY(0);
        setIconRounded(true);
        setIconBgColor('transparent');
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleIconCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!iconSourceImg) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    iconDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origOffX: iconOffsetX,
      origOffY: iconOffsetY,
    };
  };

  const handleIconCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!iconDragRef.current) return;
    // Preview box is 160px representing 256px canvas -> scale pointer delta by 256/160
    const factor = 256 / 160;
    const nextX = Math.max(-128, Math.min(128, Math.round(iconDragRef.current.origOffX + (e.clientX - iconDragRef.current.startX) * factor)));
    const nextY = Math.max(-128, Math.min(128, Math.round(iconDragRef.current.origOffY + (e.clientY - iconDragRef.current.startY) * factor)));
    setIconOffsetX(nextX);
    setIconOffsetY(nextY);
  };

  const handleIconCanvasPointerUp = () => {
    iconDragRef.current = null;
  };

  const handleApplyCalibratedSoftwareIcon = async () => {
    const finalDataUrl = calibratedIconPreview || appSettings?.software_icon || null;
    if (!finalDataUrl) return;

    setIconSaving(true);
    setIconStatus(null);
    try {
      const res = await api.applySoftwareIcon(finalDataUrl);

      setAppSettings((prev) => (prev ? { ...prev, software_icon: finalDataUrl } : prev));
      window.dispatchEvent(new CustomEvent('eim-software-icon-changed', { detail: finalDataUrl }));

      const electronAPI = (window as any)?.electronAPI;
      if (electronAPI?.setSoftwareIcon) {
        await electronAPI.setSoftwareIcon(finalDataUrl).catch(() => {});
      }

      setIconStatus({
        type: 'success',
        message: res.message || 'Software icon calibrated and applied to Desktop & App!',
      });
    } catch (err: any) {
      setIconStatus({
        type: 'error',
        message: err?.message || 'Failed to apply software icon.',
      });
    } finally {
      setIconSaving(false);
    }
  };

  const handleResetSoftwareIcon = async () => {
    setIconSaving(true);
    setIconStatus(null);
    try {
      const res = await api.applySoftwareIcon(null);
      setIconSourceImg(null);
      setIconNaturalDims(null);
      setCalibratedIconPreview(null);
      setAppSettings((prev) => (prev ? { ...prev, software_icon: null } : prev));
      window.dispatchEvent(new CustomEvent('eim-software-icon-changed', { detail: null }));

      const electronAPI = (window as any)?.electronAPI;
      if (electronAPI?.setSoftwareIcon) {
        await electronAPI.setSoftwareIcon(null).catch(() => {});
      }

      setIconStatus({
        type: 'success',
        message: res.message || 'Software icon reset to default.',
      });
    } catch (err: any) {
      setIconStatus({
        type: 'error',
        message: err?.message || 'Failed to reset software icon.',
      });
    } finally {
      setIconSaving(false);
    }
  };

  const handleUpdateSequence = async (seqId: string) => {
    if (!companyId) return;
    try {
      const normalizedSeq: Partial<NumberingSequence> = {
        ...seqFormData,
        ...(seqFormData.current_number !== undefined
          ? { current_number: Number(seqFormData.current_number) || 0 }
          : {}),
        ...(seqFormData.padding_length !== undefined
          ? { padding_length: Number(seqFormData.padding_length) || 4 }
          : {}),
      };
      await api.updateSequence(companyId, seqId, normalizedSeq);
      const updated = await api.getSequences(companyId);
      setSequences(updated);
      setEditingSeqId(null);
      setSeqFormData({});
      alert('Sequence updated successfully!');
    } catch (err: any) {
      alert(err.message || 'Error updating sequence');
    }
  };

  const handleTestLanHost = async () => {
    setLanTesting(true);
    setLanStatus(null);
    try {
      const electronAPI = (window as any)?.electronAPI;
      if (electronAPI?.testLanHost) {
        const res = await electronAPI.testLanHost(lanHostIp.trim(), Number(lanPort) || 4200);
        setLanStatus({ success: Boolean(res?.success), message: res?.message || 'Test completed.' });
      } else {
        setLanStatus({
          success: false,
          message: 'Direct Desktop LAN test is available inside the installed Enterprise Invoice Manager desktop app.',
        });
      }
    } catch (err: any) {
      setLanStatus({ success: false, message: err?.message || 'Failed to test Main PC connection.' });
    } finally {
      setLanTesting(false);
    }
  };

  const handleSaveLanDesktopConfig = async (
    relaunchAfterSave: boolean,
    targetRole?: 'STANDALONE' | 'LAN_HOST' | 'LAN_CLIENT'
  ) => {
    const roleToSave = targetRole || lanRole;
    setLanSaving(true);
    setLanStatus(null);
    try {
      const electronAPI = (window as any)?.electronAPI;
      if (!electronAPI?.setLanConfig) {
        if (roleToSave === 'LAN_CLIENT' && !lanHostIp.trim()) {
          setLanStatus({
            success: false,
            message: 'Please enter the Main Office PC IP address (for example: 192.168.1.100).',
          });
          return;
        }
        if (roleToSave === 'LAN_CLIENT' && !lanStaffName.trim()) {
          setLanStatus({
            success: false,
            message: 'Please enter your assigned Staff Name given by the Host PC.',
          });
          return;
        }
        if (roleToSave === 'LAN_CLIENT') {
          localStorage.setItem('eim_lan_role', 'LAN_CLIENT');
          localStorage.setItem('eim_lan_host_ip', lanHostIp.trim());
          localStorage.setItem('eim_lan_host_port', String(Number(lanPort) || 4200));
        } else {
          localStorage.setItem('eim_lan_role', 'STANDALONE');
          localStorage.removeItem('eim_lan_host_ip');
        }
        setLocalDeviceIdentity(
          lanDeviceId || 'web-pc',
          roleToSave === 'LAN_CLIENT' ? lanStaffName.trim() : lanDeviceName.trim() || 'Office PC',
          roleToSave === 'LAN_CLIENT' ? lanStaffName.trim() : ''
        );
        window.dispatchEvent(new Event('eim-permissions-changed'));
        window.dispatchEvent(new Event('eim-data-sync'));
        setLanStatus({
          success: true,
          message:
            roleToSave === 'STANDALONE'
              ? 'Standalone Mode is active! You can continue using the software.'
              : roleToSave === 'LAN_HOST'
              ? 'Host Mode active! Office database is ready for staff connections.'
              : `Connected as Staff: "${lanStaffName.trim()}"! Permissions recognized.`,
        });
        if (roleToSave === 'LAN_CLIENT' && !window.location.origin.includes(lanHostIp.trim())) {
          setTimeout(() => {
            window.location.href = `http://${lanHostIp.trim()}:${Number(lanPort) || 4200}`;
          }, 600);
        }
        return;
      }

      if (roleToSave === 'LAN_CLIENT') {
        if (!lanHostIp.trim()) {
          setLanStatus({
            success: false,
            message: 'Please enter the Main Office PC IP address (for example: 192.168.1.100).',
          });
          return;
        }
        if (!lanStaffName.trim()) {
          setLanStatus({
            success: false,
            message: 'Please enter your assigned Staff Name given by the Host PC.',
          });
          return;
        }
        localStorage.setItem('eim_lan_role', 'LAN_CLIENT');
        localStorage.setItem('eim_lan_host_ip', lanHostIp.trim());
        localStorage.setItem('eim_lan_host_port', String(Number(lanPort) || 4200));
      } else {
        localStorage.setItem('eim_lan_role', 'STANDALONE');
        localStorage.removeItem('eim_lan_host_ip');
      }

      const effectiveDeviceName = roleToSave === 'LAN_CLIENT' ? lanStaffName.trim() : lanDeviceName.trim();
      const savedRes = await electronAPI.setLanConfig({
        role: roleToSave,
        hostIp: roleToSave === 'STANDALONE' ? '' : lanHostIp.trim(),
        port: Number(lanPort) || 4200,
        deviceName: effectiveDeviceName || undefined,
        staffName: roleToSave === 'LAN_CLIENT' ? lanStaffName.trim() : undefined,
        minimizeToTray: lanMinimizeToTray,
        autoStartOnBoot: lanAutoStartOnBoot,
      });

      if (savedRes?.config?.deviceId) {
        setLocalDeviceIdentity(
          savedRes.config.deviceId,
          effectiveDeviceName || savedRes.config.deviceName,
          roleToSave === 'LAN_CLIENT' ? lanStaffName.trim() : ''
        );
        api.getMyWorkstationPermission().catch(() => {});
        window.dispatchEvent(new Event('eim-permissions-changed'));
        window.dispatchEvent(new Event('eim-data-sync'));
      }

      // Automatically synchronize database persistence without requiring manual user action
      api.autoSyncDatabaseMode(roleToSave).then(loadDiagnosticsData).catch(() => {});

      if (relaunchAfterSave && electronAPI.relaunchApp) {
        await electronAPI.relaunchApp();
        return;
      }

      setLanStatus({
        success: true,
        message:
          roleToSave === 'STANDALONE'
            ? 'Standalone Mode saved! Ready to continue.'
            : roleToSave === 'LAN_HOST'
            ? 'Host Mode configured! Staff PCs can now connect to this PC.'
            : `Connected to Host as Staff: "${lanStaffName.trim()}"! Permissions recognized.`,
      });
    } catch (err: any) {
      setLanStatus({ success: false, message: err?.message || 'Could not save LAN configuration.' });
    } finally {
      setLanSaving(false);
    }
  };

  const handleDisconnectToStandalone = async () => {
    setLanSaving(true);
    setLanStatus(null);
    try {
      localStorage.setItem('eim_lan_role', 'STANDALONE');
      localStorage.removeItem('eim_lan_host_ip');
      setLanRole('STANDALONE');
      api.autoSyncDatabaseMode('STANDALONE').then(loadDiagnosticsData).catch(() => {});
      const electronAPI = (window as any)?.electronAPI;
      if (electronAPI?.setLanConfig) {
        await electronAPI.setLanConfig({
          role: 'STANDALONE',
          hostIp: '',
          port: Number(lanPort) || 4200,
          deviceName: lanDeviceName || undefined,
          staffName: undefined,
          minimizeToTray: false,
          autoStartOnBoot: false,
        });
        if (electronAPI.relaunchApp) {
          await electronAPI.relaunchApp();
          return;
        }
      }
      // Browser fallback
      window.dispatchEvent(new Event('eim-permissions-changed'));
      window.dispatchEvent(new Event('eim-data-sync'));
      setLanStatus({
        success: true,
        message: 'Switched to Standalone Mode! You can now use the software offline on this laptop.',
      });
      setTimeout(() => {
        window.location.href = `http://127.0.0.1:${lanPort || 4200}`;
      }, 600);
    } catch (err: any) {
      setLanStatus({
        success: false,
        message: err.message || 'Failed to switch to Standalone mode.',
      });
    } finally {
      setLanSaving(false);
    }
  };

  const handleInitiateCreateStaff = () => {
    const clean = hostNewStaffName.trim();
    if (!clean) {
      setPermStatus({ success: false, message: 'Please enter a name for the staff member.' });
      return;
    }
    setPinPromptState({
      type: 'CREATE_STAFF',
      title: `Create Staff Member "${clean}"`,
      description: `Enter the 4-digit MD / Admin PIN to authorize and create staff member "${clean}" with ${hostNewStaffMenus.length} allowed menus:`,
      data: {
        staffName: clean,
        allowedMenus: [...hostNewStaffMenus],
        canOpenSettings: hostNewStaffCanSettings,
      },
    });
    setPinPromptInput('');
    setPinPromptError('');
  };

  const handleInitiateSaveWorkstation = (ws: any) => {
    setPinPromptState({
      type: 'SAVE_STAFF',
      title: `Save Permissions for "${ws.device_name}"`,
      description: `Enter the 4-digit MD / Admin PIN to authorize and save updated menu permissions for "${ws.device_name}":`,
      data: { ws },
    });
    setPinPromptInput('');
    setPinPromptError('');
  };

  const handleInitiateDeleteWorkstation = (ws: any) => {
    setPinPromptState({
      type: 'DELETE_STAFF',
      title: `Remove Staff Member "${ws.device_name}"`,
      description: `Enter the 4-digit MD / Admin PIN to authorize deleting staff member "${ws.device_name}" from office records:`,
      data: { ws },
    });
    setPinPromptInput('');
    setPinPromptError('');
  };

  const handleConfirmPinAction = async () => {
    if (!pinPromptState) return;
    const cleanPin = pinPromptInput.trim();
    if (!/^\d{4}$/.test(cleanPin)) {
      setPinPromptError('PIN must be exactly 4 numeric digits (0-9).');
      return;
    }
    setPinPromptLoading(true);
    setPinPromptError('');
    try {
      if (pinPromptState.type === 'CREATE_STAFF') {
        const { staffName, allowedMenus, canOpenSettings } = pinPromptState.data;
        await api.createStaffMember(staffName, allowedMenus, canOpenSettings, cleanPin);
        setPermStatus({
          success: true,
          message: `Staff member "${staffName}" created with ${allowedMenus.length} allowed menus!`,
        });
        setHostNewStaffName('');
        setHostNewStaffMenus(
          permDefaultStaffMenus.length > 0
            ? [...permDefaultStaffMenus]
            : ['invoices', 'invoices_other', 'quotations', 'customers', 'suppliers', 'products', 'purchases', 'inventory', 'payments']
        );
        await loadWorkstationPermissions();
      } else if (pinPromptState.type === 'SAVE_STAFF') {
        const { ws } = pinPromptState.data;
        setPermSavingId(ws.device_id);
        await api.updateWorkstationPermission(
          ws.device_id,
          {
            device_name: ws.device_name,
            is_admin: Boolean(ws.is_admin),
            allowed_menus: ws.allowed_menus,
            can_open_settings: Boolean(ws.can_open_settings),
          },
          cleanPin
        );
        setPermStatus({ success: true, message: `Saved menu permissions for "${ws.device_name}"!` });
        window.dispatchEvent(new Event('eim-permissions-changed'));
        await loadWorkstationPermissions();
      } else if (pinPromptState.type === 'DELETE_STAFF') {
        const { ws } = pinPromptState.data;
        await api.deleteWorkstation(ws.device_id, cleanPin);
        setPermStatus({ success: true, message: `Removed staff member "${ws.device_name}".` });
        await loadWorkstationPermissions();
      }
      setSessionAdminPin(cleanPin);
      setPinPromptState(null);
      setPinPromptInput('');
    } catch (err: any) {
      setPinPromptError(err?.message || 'Incorrect 4-digit MD / Admin PIN.');
    } finally {
      setPinPromptLoading(false);
      setPermSavingId(null);
    }
  };

  const handleCopyLanIp = (ip: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(ip).catch(() => {});
    }
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(''), 1800);
  };

  const loadWorkstationPermissions = async () => {
    setPermLoading(true);
    setPermStatus(null);
    try {
      const me = await api.getMyWorkstationPermission();
      setPermHasAdminPin(true);
      setPermHasCustomPin(Boolean(me.has_custom_pin));
      setPermMenuCatalog(me.menu_catalog || []);
      setPermPresets(me.presets || {});

      try {
        const listRes = await api.getWorkstations();
        const staffOnly = (listRes.workstations || []).filter((w: any) => !w.is_admin && w.role !== 'ADMIN');
        setPermWorkstations(staffOnly);
        setPermDefaultStaffMenus(listRes.default_staff_menus || []);
        setPermHasCustomPin(Boolean(listRes.has_custom_pin ?? me.has_custom_pin));
        setPermUnlocked(true);
      } catch {
        setPermUnlocked(false);
      }
    } catch (err: any) {
      setPermStatus({ success: false, message: err?.message || 'Could not load workstation permissions.' });
    } finally {
      setPermLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeCategory === 'Deployment_Mode') {
      loadWorkstationPermissions();
    }
  }, [isOpen, activeCategory]);

  const handleUnlockPermissions = async () => {
    if (!permPinInput.trim()) return;
    setPermStatus(null);
    try {
      await api.verifyAdminPin(permPinInput.trim());
      setSessionAdminPin(permPinInput.trim());
      setPermPinInput('');
      await loadWorkstationPermissions();
    } catch (err: any) {
      setPermStatus({ success: false, message: err?.message || 'Incorrect MD / Admin PIN.' });
    }
  };

  const handleUpdateAdminPin = async () => {
    setPermStatus(null);
    try {
      const cur = permCurrentPin.trim() || null;
      const next = permNewPin.trim();
      if (!/^\d{4}$/.test(next)) {
        setPermStatus({ success: false, message: 'New PIN must be exactly 4 numeric digits (0-9).' });
        return;
      }
      if (permHasCustomPin && (!cur || !/^\d{4}$/.test(cur))) {
        setPermStatus({ success: false, message: 'Please enter your current 4-digit PIN.' });
        return;
      }
      const res = await api.setAdminPin(next, cur || (permHasCustomPin ? undefined : '1234'));
      setPermHasAdminPin(Boolean(res.has_admin_pin));
      setPermHasCustomPin(true);
      setSessionAdminPin(next || '');
      setPermCurrentPin('');
      setPermNewPin('');
      setPermStatus({
        success: true,
        message: '4-digit MD / Admin PIN saved securely!',
      });
      await loadWorkstationPermissions();
    } catch (err: any) {
      setPermStatus({ success: false, message: err?.message || 'Could not update MD / Admin PIN.' });
    }
  };

  const toggleWorkstationMenu = (deviceId: string, menuId: string) => {
    setPermWorkstations((prev) =>
      prev.map((ws) => {
        if (ws.device_id !== deviceId) return ws;
        const curr: string[] = Array.isArray(ws.allowed_menus) ? ws.allowed_menus : [];
        const next = curr.includes(menuId) ? curr.filter((m) => m !== menuId) : [...curr, menuId];
        return { ...ws, is_admin: false, allowed_menus: next };
      })
    );
  };

  const applyPresetToWorkstation = (deviceId: string, presetKey: string) => {
    const preset = permPresets[presetKey];
    if (!preset) return;
    setPermWorkstations((prev) =>
      prev.map((ws) =>
        ws.device_id === deviceId
          ? {
              ...ws,
              is_admin: Boolean(preset.is_admin),
              can_open_settings: Boolean(preset.can_open_settings),
              allowed_menus: [...(preset.allowed_menus || [])],
            }
          : ws
      )
    );
  };

  const handleSaveWorkstationPermission = async (ws: any) => {
    setPermSavingId(ws.device_id);
    setPermStatus(null);
    try {
      await api.updateWorkstationPermission(ws.device_id, {
        device_name: ws.device_name,
        is_admin: Boolean(ws.is_admin),
        allowed_menus: ws.allowed_menus,
        can_open_settings: Boolean(ws.can_open_settings),
      });
      setPermStatus({ success: true, message: `Saved menu permissions for "${ws.device_name}"!` });
      window.dispatchEvent(new Event('eim-permissions-changed'));
      await loadWorkstationPermissions();
    } catch (err: any) {
      setPermStatus({ success: false, message: err?.message || 'Failed to save workstation permissions.' });
    } finally {
      setPermSavingId(null);
    }
  };

  const handleDeleteWorkstation = async (ws: any) => {
    if (!window.confirm(`Remove "${ws.device_name}" from the office permissions list?`)) return;
    try {
      await api.deleteWorkstation(ws.device_id);
      await loadWorkstationPermissions();
    } catch (err: any) {
      setPermStatus({ success: false, message: err?.message || 'Could not remove workstation.' });
    }
  };

  const handleSaveDefaultStaffMenus = async () => {
    setPermStatus(null);
    try {
      await api.updateDefaultStaffMenus(permDefaultStaffMenus);
      setPermStatus({ success: true, message: 'Default menus for new Staff PCs updated!' });
    } catch (err: any) {
      setPermStatus({ success: false, message: err?.message || 'Could not save default staff menus.' });
    }
  };

  const handleResetAllData = async () => {
    const confirmation = window.prompt(
      'DANGER: This will permanently delete ALL companies, invoices, customers, products, payments, and business data from the database.\n\nType RESET to confirm:'
    );
    if (confirmation !== 'RESET') {
      if (confirmation !== null) alert('Confirmation text did not match "RESET". Action cancelled.');
      return;
    }

    setResetting(true);
    try {
      await api.resetAllData();
      alert('All companies and data have been completely wiped. The application will now reload.');
      window.location.reload();
    } catch (err: any) {
      alert(err.message || 'Error clearing data');
    } finally {
      setResetting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden">
        {/* Title Bar */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2">
            <Settings className="w-5 h-5 text-brand-600" />
            <h2 className="text-base font-bold text-slate-800">Configuration & Preferences</h2>
            {company ? (
              <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-semibold border border-brand-200">
                {company.name}
              </span>
            ) : (
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-semibold border border-slate-200">
                Global System Settings
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Container: Sidebar + Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Category Sidebar */}
          <div className="w-64 border-r border-slate-200 bg-slate-50/70 p-3 overflow-y-auto space-y-4 text-xs font-medium select-none">
            {/* Business Group */}
            <div>
              <div className="font-bold text-slate-400 uppercase tracking-wider px-2 mb-1 flex items-center space-x-1">
                <Settings className="w-3.5 h-3.5 text-slate-400" />
                <span>Business</span>
              </div>
              <div className="space-y-0.5">
                {[
                  { id: 'Business_Settings', label: 'Document Settings' },
                  { id: 'Business_Currency', label: 'Currency & Numbering' },
                  { id: 'Business_Logo', label: 'Company Logo' },
                  { id: 'Software_Icon', label: 'Software Icon' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveCategory(item.id)}
                    className={`w-full text-left px-3 py-1.5 rounded-md transition-colors ${
                      activeCategory === item.id ? 'bg-brand-100 text-brand-900 font-bold' : 'text-slate-700 hover:bg-slate-200/60'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sales Documents Group */}
            <div>
              <div className="font-bold text-slate-400 uppercase tracking-wider px-2 mb-1 flex items-center space-x-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>Sales & Quotations</span>
              </div>
              <div className="space-y-0.5">
                {[
                  { id: 'Sales_Invoice_Rules', label: 'Invoice Rules & Terms' },
                  { id: 'Sales_Quotation_Defaults', label: 'Quotation Defaults' },
                  { id: 'Sales_Numbering_Sequences', label: 'Numbering Sequences' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveCategory(item.id)}
                    className={`w-full text-left px-3 py-1.5 rounded-md transition-colors ${
                      activeCategory === item.id ? 'bg-brand-100 text-brand-900 font-bold' : 'text-slate-700 hover:bg-slate-200/60'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Saving Paths by Category */}
            <div>
              <div className="font-bold text-slate-400 uppercase tracking-wider px-2 mb-1 flex items-center space-x-1">
                <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
                <span>Saving Paths</span>
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => setActiveCategory('Category_Save_Paths')}
                  className={`w-full text-left px-3 py-1.5 rounded-md transition-colors ${
                    activeCategory === 'Category_Save_Paths' ? 'bg-brand-100 text-brand-900 font-bold' : 'text-slate-700 hover:bg-slate-200/60'
                  }`}
                >
                  Local Folders by Category
                </button>
              </div>
            </div>

            {/* Inventory Group */}
            <div>
              <div className="font-bold text-slate-400 uppercase tracking-wider px-2 mb-1 flex items-center space-x-1">
                <Package className="w-3.5 h-3.5 text-slate-400" />
                <span>Inventory & Stock</span>
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => setActiveCategory('Inventory_Rules')}
                  className={`w-full text-left px-3 py-1.5 rounded-md transition-colors ${
                    activeCategory === 'Inventory_Rules' ? 'bg-brand-100 text-brand-900 font-bold' : 'text-slate-700 hover:bg-slate-200/60'
                  }`}
                >
                  Valuation & Alerts
                </button>
              </div>
            </div>

            {/* Deployment & LAN Group */}
            <div>
              <div className="font-bold text-slate-400 uppercase tracking-wider px-2 mb-1 flex items-center space-x-1">
                <Server className="w-3.5 h-3.5 text-slate-400" />
                <span>Deployment &amp; Network</span>
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => setActiveCategory('Deployment_Mode')}
                  className={`w-full text-left px-3 py-1.5 rounded-md transition-colors ${
                    activeCategory === 'Deployment_Mode' ? 'bg-brand-100 text-brand-900 font-bold' : 'text-slate-700 hover:bg-slate-200/60'
                  }`}
                >
                  Standalone / LAN Setup
                </button>
              </div>
            </div>

            {/* System Diagnostics & Logs */}
            <div>
              <div className="font-bold text-slate-400 uppercase tracking-wider px-2 mb-1 flex items-center space-x-1">
                <Activity className="w-3.5 h-3.5 text-slate-400" />
                <span>Diagnostics &amp; Logs</span>
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => setActiveCategory('System_Diagnostics')}
                  className={`w-full text-left px-3 py-1.5 rounded-md transition-colors ${
                    activeCategory === 'System_Diagnostics' ? 'bg-brand-100 text-brand-900 font-bold' : 'text-slate-700 hover:bg-slate-200/60'
                  }`}
                >
                  System Diagnostics &amp; Logs
                </button>
              </div>
            </div>

            {/* Danger Zone / Factory Reset Group */}
            <div className="pt-2 border-t border-slate-200">
              <div className="font-bold text-red-500 uppercase tracking-wider px-2 mb-1 flex items-center space-x-1">
                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                <span>Danger Zone</span>
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => setActiveCategory('Factory_Reset')}
                  className={`w-full text-left px-3 py-1.5 rounded-md transition-colors ${
                    activeCategory === 'Factory_Reset'
                      ? 'bg-red-100 text-red-900 font-bold'
                      : 'text-red-700 hover:bg-red-50'
                  }`}
                >
                  Factory Reset &amp; Wipe Data
                </button>
              </div>
            </div>
          </div>

          {/* Right Main Settings Panel */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center p-8 space-y-3">
                <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
                <span className="text-sm font-semibold text-slate-600">Loading Configuration & Preferences...</span>
              </div>
            ) : error ? (
              <div className="h-full flex flex-col items-center justify-center p-8 space-y-3 text-center">
                <AlertCircle className="w-8 h-8 text-rose-500" />
                <span className="text-sm font-bold text-slate-800">Failed to load configuration</span>
                <p className="text-xs text-slate-500 max-w-sm">{error}</p>
                <button
                  type="button"
                  onClick={loadAllSettings}
                  className="px-4 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-semibold hover:bg-brand-700"
                >
                  Retry
                </button>
              </div>
            ) : activeCategory !== 'Deployment_Mode' &&
              activeCategory !== 'Factory_Reset' &&
              activeCategory !== 'Software_Icon' &&
              (!companySettings || !company) ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
                <Building2 className="w-12 h-12 text-slate-400 mb-3" />
                <h3 className="text-sm font-bold text-slate-800">No Business Profile Selected</h3>
                <p className="text-xs text-slate-500 mt-1 mb-4">
                  Select or create a business profile to configure business-specific document rules, tax rates, numbering sequences, and logos.
                </p>
                {onOpenCompanyModal && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCompanyModal();
                    }}
                    className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                  >
                    Select or Create Business Profile
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* 1. Document Settings */}
                {activeCategory === 'Business_Settings' && companySettings && (
              <>
                <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-white shadow-sm">
                  <h3 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-2">Document Behavior</h3>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Invoice overdue days (Grace Period):</label>
                      <input
                        type="number"
                        placeholder="e.g. 30"
                        value={companySettings.invoice_overdue_days ?? ''}
                        onChange={(e) =>
                          updateCompanySetting(
                            'invoice_overdue_days',
                            (e.target.value === '' ? '' : Number(e.target.value)) as any
                          )
                        }
                        className="w-32 border border-slate-300 rounded px-2.5 py-1 text-sm outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 text-xs">
                    <label className="flex items-center space-x-2 text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={companySettings.print_invoice_after_save}
                        onChange={(e) => updateCompanySetting('print_invoice_after_save', e.target.checked)}
                        className="w-4 h-4 rounded text-brand-600 border-slate-300"
                      />
                      <span>Print invoice immediately after finalization</span>
                    </label>

                    <label className="flex items-center space-x-2 text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={companySettings.show_postal_code_before_city}
                        onChange={(e) => updateCompanySetting('show_postal_code_before_city', e.target.checked)}
                        className="w-4 h-4 rounded text-brand-600 border-slate-300"
                      />
                      <span>Show postal PIN code before city in addresses</span>
                    </label>

                    <label className="flex items-center space-x-2 text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={companySettings.include_additional_notes_in_search}
                        onChange={(e) => updateCompanySetting('include_additional_notes_in_search', e.target.checked)}
                        className="w-4 h-4 rounded text-brand-600 border-slate-300"
                      />
                      <span>Include Additional Notes when searching invoices</span>
                    </label>

                    <label className="flex items-center space-x-2 text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={companySettings.sort_invoices_by_number}
                        onChange={(e) => updateCompanySetting('sort_invoices_by_number', e.target.checked)}
                        className="w-4 h-4 rounded text-brand-600 border-slate-300"
                      />
                      <span>Sort invoices by document number column by default</span>
                    </label>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-white shadow-sm">
                  <h3 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-2">Printed Date Format</h3>
                  <div className="w-72 text-xs">
                    <label className="block font-semibold text-slate-700 mb-1">Standard display date format:</label>
                    <select
                      value={companySettings.printed_date_format}
                      onChange={(e) => updateCompanySetting('printed_date_format', e.target.value)}
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm bg-white outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="DD/MM/YYYY">DD/MM/YYYY (e.g. 09/11/2026)</option>
                      <option value="DD MMMM YYYY">DD MMMM YYYY (e.g. 09 November 2026)</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD (e.g. 2026-11-09)</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* 2. Currency & Numbering */}
            {activeCategory === 'Business_Currency' && companySettings && (
              <div className="border border-slate-200 rounded-lg p-4 space-y-4 bg-white shadow-sm">
                <h3 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-2">
                  Currency & Numbering Formatting
                </h3>
                <div className="space-y-3 text-xs">
                  <label className="flex items-center space-x-2 text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={companySettings.show_amount_in_words}
                      onChange={(e) => updateCompanySetting('show_amount_in_words', e.target.checked)}
                      className="w-4 h-4 rounded text-brand-600 border-slate-300"
                    />
                    <span>Print Amount in Words automatically on document footers</span>
                  </label>

                  <label className="flex items-center space-x-2 text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={companySettings.indian_number_style}
                      onChange={(e) => updateCompanySetting('indian_number_style', e.target.checked)}
                      className="w-4 h-4 rounded text-brand-600 border-slate-300"
                    />
                    <span>Indian Numbering Grouping (Crores & Lakhs, e.g. 12,34,567.00)</span>
                  </label>

                  <label className="flex items-center space-x-2 text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={companySettings.zero_not_displayed}
                      onChange={(e) => updateCompanySetting('zero_not_displayed', e.target.checked)}
                      className="w-4 h-4 rounded text-brand-600 border-slate-300"
                    />
                    <span>Suppress zeroes on printouts</span>
                  </label>

                  <div className="grid grid-cols-3 gap-4 pt-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Currency Name:</label>
                      <input
                        type="text"
                        value={companySettings.currency_name}
                        onChange={(e) => updateCompanySetting('currency_name', e.target.value)}
                        className="w-full border border-slate-300 rounded px-2.5 py-1 text-sm outline-none focus:ring-1 focus:ring-brand-500"
                        placeholder="Rupees"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Currency Symbol:</label>
                      <input
                        type="text"
                        value={companySettings.currency_symbol}
                        onChange={(e) => updateCompanySetting('currency_symbol', e.target.value)}
                        className="w-full border border-slate-300 rounded px-2.5 py-1 text-sm outline-none focus:ring-1 focus:ring-brand-500"
                        placeholder="₹"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Fractional Decimal Name:</label>
                      <input
                        type="text"
                        value={companySettings.decimal_name}
                        onChange={(e) => updateCompanySetting('decimal_name', e.target.value)}
                        className="w-full border border-slate-300 rounded px-2.5 py-1 text-sm outline-none focus:ring-1 focus:ring-brand-500"
                        placeholder="Paise"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Company Logo */}
            {activeCategory === 'Business_Logo' && company && (
              <div className="border border-slate-200 rounded-lg p-5 space-y-4 bg-white shadow-sm">
                <h3 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-2 flex items-center space-x-2">
                  <ImageIcon className="w-4 h-4 text-brand-600" />
                  <span>Company Brand Logo</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Upload your high-resolution company emblem or trade logo. It prints directly on PDF invoices, quotations, and official receipts.
                </p>

                <div className="flex items-center space-x-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="w-36 h-28 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center bg-white overflow-hidden shadow-sm">
                    {company.logo_url ? (
                      <img src={company.logo_url} alt="Company Logo" className="max-w-full max-h-full object-contain p-2" />
                    ) : (
                      <div className="text-center p-3">
                        <ImageIcon className="w-8 h-8 text-slate-300 mx-auto mb-1" />
                        <span className="text-[10px] text-slate-400 font-semibold">No Logo Uploaded</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <label className="cursor-pointer inline-flex items-center space-x-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-bold shadow-sm transition-colors">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload New Logo</span>
                        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} className="hidden" />
                      </label>

                      {company.logo_url && (
                        <button
                          type="button"
                          onClick={handleClearLogo}
                          className="px-3 py-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded text-xs font-semibold"
                        >
                          Remove Logo
                        </button>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Recommended formats: Transparent PNG, high-res JPG. Dimensions: up to 800x400 px.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3B. Software Icon (Desktop Application & Logo Icon with Live Calibrator) */}
            {activeCategory === 'Software_Icon' && (() => {
              const activeIconPreview = calibratedIconPreview || appSettings?.software_icon || null;
              return (
                <div className="border border-slate-200 rounded-lg p-5 space-y-5 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <h3 className="font-bold text-sm text-slate-800 flex items-center space-x-2">
                      <Monitor className="w-4 h-4 text-brand-600" />
                      <span>Software Logo &amp; Desktop Application Icon</span>
                    </h3>
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{iconSourceImg ? 'Choose Another Image' : 'Upload Image'}</span>
                        <input
                          type="file"
                          accept="image/*,.ico"
                          onChange={handleSoftwareIconFileSelect}
                          disabled={iconSaving}
                          className="hidden"
                        />
                      </label>

                      {(appSettings?.software_icon || iconSourceImg) && (
                        <button
                          type="button"
                          disabled={iconSaving}
                          onClick={handleResetSoftwareIcon}
                          className="inline-flex items-center space-x-1 px-3 py-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Reset Default</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Interactive Calibrator + Exact Previews */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    {/* Left: Interactive Drag & Crop Calibrator */}
                    <div className="lg:col-span-5 flex flex-col items-center space-y-3">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        {iconSourceImg ? 'Drag Image to Position (256×256)' : 'Current Software Icon'}
                      </div>

                      <div
                        onPointerDown={handleIconCanvasPointerDown}
                        onPointerMove={handleIconCanvasPointerMove}
                        onPointerUp={handleIconCanvasPointerUp}
                        onPointerCancel={handleIconCanvasPointerUp}
                        className={`w-40 h-40 rounded-2xl border-2 border-dashed border-brand-400 flex items-center justify-center overflow-hidden shadow-inner select-none relative ${
                          iconSourceImg ? 'cursor-grab active:cursor-grabbing' : ''
                        }`}
                        style={{
                          backgroundImage:
                            'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)',
                          backgroundSize: '16px 16px',
                          backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                          backgroundColor: '#f8fafc',
                        }}
                      >
                        {activeIconPreview ? (
                          <img
                            src={activeIconPreview}
                            alt="Calibrated Icon Preview"
                            draggable={false}
                            className="w-full h-full object-cover pointer-events-none"
                          />
                        ) : (
                          <div className="w-full h-full rounded-2xl bg-brand-600 flex items-center justify-center text-white font-bold text-6xl">
                            Σ
                          </div>
                        )}
                      </div>

                      {iconNaturalDims && (
                        <div className="text-[10px] text-slate-500 font-mono">
                          Source: {iconNaturalDims.width} × {iconNaturalDims.height} px → Output: 256 × 256 px (.ico)
                        </div>
                      )}

                      {/* Live Previews: Exact Desktop & Header Match */}
                      <div className="w-full flex items-center justify-center gap-3 pt-1">
                        {/* Desktop Shortcut Preview */}
                        <div className="flex flex-col items-center justify-center px-3 py-2.5 rounded-xl bg-gradient-to-br from-sky-900 to-slate-900 text-white w-32 shadow border border-slate-700 select-none">
                          {activeIconPreview ? (
                            <img
                              src={activeIconPreview}
                              alt="Desktop Preview"
                              className="w-12 h-12 object-cover shadow-md"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center text-white font-bold text-2xl shadow-md">
                              Σ
                            </div>
                          )}
                          <span className="mt-1.5 text-[9px] font-semibold text-center leading-tight text-white/95">
                            Enterprise Invoice
                          </span>
                          <span className="text-[8px] text-sky-300 uppercase font-bold mt-0.5">Desktop</span>
                        </div>

                        {/* Top Navbar Logo Preview */}
                        <div className="flex flex-col items-center justify-center px-3 py-2.5 rounded-xl bg-white border border-slate-200 w-36 shadow-sm select-none">
                          <div className="flex items-center space-x-1.5 py-2">
                            {activeIconPreview ? (
                              <img
                                src={activeIconPreview}
                                alt="Header Preview"
                                className="w-8 h-8 rounded-lg object-cover shadow-sm"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                                Σ
                              </div>
                            )}
                            <span className="text-[11px] font-extrabold text-brand-900 leading-tight">
                              Enterprise<br />Invoicer
                            </span>
                          </div>
                          <span className="text-[8px] text-slate-400 uppercase font-bold">Top Bar Match</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Calibration Sliders & Apply Action */}
                    <div className="lg:col-span-7 space-y-3.5 text-xs">
                      <div className="font-bold text-slate-800">Icon Calibrator (Eliminate Top/Bottom Empty Space)</div>

                      {/* Fill vs Fit Toggle */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={!iconSourceImg}
                          onClick={() => {
                            setIconFitMode('COVER');
                            setIconZoom(1);
                            setIconOffsetX(0);
                            setIconOffsetY(0);
                          }}
                          className={`px-3 py-2 rounded-lg border text-left transition-all disabled:opacity-50 ${
                            iconFitMode === 'COVER'
                              ? 'border-brand-600 bg-brand-50 text-brand-900 font-bold'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <div>Fill Square (No Gaps)</div>
                          <div className="text-[10px] font-normal text-slate-500">Matches default Σ logo edge-to-edge</div>
                        </button>
                        <button
                          type="button"
                          disabled={!iconSourceImg}
                          onClick={() => {
                            setIconFitMode('CONTAIN');
                            setIconZoom(1);
                            setIconOffsetX(0);
                            setIconOffsetY(0);
                          }}
                          className={`px-3 py-2 rounded-lg border text-left transition-all disabled:opacity-50 ${
                            iconFitMode === 'CONTAIN'
                              ? 'border-brand-600 bg-brand-50 text-brand-900 font-bold'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <div>Fit Full Image</div>
                          <div className="text-[10px] font-normal text-slate-500">Shows entire wide logo without cropping</div>
                        </button>
                      </div>

                      {/* Zoom Slider */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="font-semibold text-slate-700">Zoom Scale:</label>
                          <span className="font-mono text-[11px] font-bold text-brand-700">{Math.round(iconZoom * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0.5}
                          max={3}
                          step={0.05}
                          disabled={!iconSourceImg}
                          value={iconZoom}
                          onChange={(e) => setIconZoom(parseFloat(e.target.value))}
                          className="w-full accent-brand-600 disabled:opacity-40"
                        />
                      </div>

                      {/* X / Y Position Sliders */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="font-semibold text-slate-700">Move Left / Right:</label>
                            <span className="font-mono text-[10px] text-slate-500">{iconOffsetX}px</span>
                          </div>
                          <input
                            type="range"
                            min={-128}
                            max={128}
                            step={1}
                            disabled={!iconSourceImg}
                            value={iconOffsetX}
                            onChange={(e) => setIconOffsetX(parseInt(e.target.value, 10))}
                            className="w-full accent-brand-600 disabled:opacity-40"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="font-semibold text-slate-700">Move Up / Down:</label>
                            <span className="font-mono text-[10px] text-slate-500">{iconOffsetY}px</span>
                          </div>
                          <input
                            type="range"
                            min={-128}
                            max={128}
                            step={1}
                            disabled={!iconSourceImg}
                            value={iconOffsetY}
                            onChange={(e) => setIconOffsetY(parseInt(e.target.value, 10))}
                            className="w-full accent-brand-600 disabled:opacity-40"
                          />
                        </div>
                      </div>

                      {/* Corner Style & Background Fill */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <label className="inline-flex items-center space-x-2 text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            disabled={!iconSourceImg}
                            checked={iconRounded}
                            onChange={(e) => setIconRounded(e.target.checked)}
                            className="w-4 h-4 rounded text-brand-600 border-slate-300"
                          />
                          <span className="font-semibold">Rounded Square Corners (matches default logo)</span>
                        </label>

                        <div className="flex items-center space-x-1.5">
                          <span className="text-[11px] font-semibold text-slate-600">BG:</span>
                          {[
                            { label: 'None', val: 'transparent' },
                            { label: 'White', val: '#ffffff' },
                            { label: 'Blue', val: '#2563eb' },
                            { label: 'Dark', val: '#0f172a' },
                          ].map((bg) => (
                            <button
                              key={bg.val}
                              type="button"
                              disabled={!iconSourceImg}
                              onClick={() => setIconBgColor(bg.val)}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors disabled:opacity-40 ${
                                iconBgColor === bg.val
                                  ? 'border-brand-600 bg-brand-50 text-brand-800'
                                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {bg.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Apply Button */}
                      <div className="flex items-center gap-2 pt-2">
                        <button
                          type="button"
                          disabled={iconSaving || !iconSourceImg}
                          onClick={handleApplyCalibratedSoftwareIcon}
                          className="inline-flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
                        >
                          {iconSaving ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          <span>{iconSaving ? 'Applying to Desktop & App...' : 'Apply Calibrated Software Icon'}</span>
                        </button>

                        {iconSourceImg && (
                          <button
                            type="button"
                            onClick={() => {
                              setIconFitMode('COVER');
                              setIconZoom(1);
                              setIconOffsetX(0);
                              setIconOffsetY(0);
                              setIconRounded(true);
                              setIconBgColor('transparent');
                            }}
                            className="px-3 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
                          >
                            Reset Calibration
                          </button>
                        )}
                      </div>

                      {iconStatus && (
                        <div
                          className={`p-2.5 rounded-lg text-xs font-semibold flex items-center space-x-2 border ${
                            iconStatus.type === 'success'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : 'bg-rose-50 border-rose-200 text-rose-800'
                          }`}
                        >
                          {iconStatus.type === 'success' ? (
                            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                          )}
                          <span>{iconStatus.message}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Ideal Image Specifications Reference */}
                  <div className="p-3.5 rounded-lg bg-sky-50/70 border border-sky-200 text-[11px] text-sky-900 space-y-1">
                    <div className="font-bold text-sky-950">Recommended Image Configuration (Exact Match for Default Logo)</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 text-sky-800">
                      <div>• <strong>Dimensions:</strong> 256 × 256 px or 512 × 512 px (1:1 Square)</div>
                      <div>• <strong>File Format:</strong> PNG (transparent or solid) / JPG / WebP / SVG</div>
                      <div>• <strong>Framing:</strong> Crop tightly around your logo (no top/bottom blank margin)</div>
                      <div>• <strong>Max File Size:</strong> Under 5 MB (auto-converted to Windows `.ico`)</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 4. Invoice Rules & Terms */}
            {activeCategory === 'Sales_Invoice_Rules' && companySettings && company && (
              <div className="border border-slate-200 rounded-lg p-5 space-y-4 bg-white shadow-sm">
                <h3 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-2 flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-brand-600" />
                  <span>Invoice Rules, Notes & Terms</span>
                </h3>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Default Invoice Terms & Conditions (Prints on every invoice):</label>
                    <textarea
                      rows={6}
                      value={company.default_invoice_terms || ''}
                      onChange={(e) => updateCompanyField('default_invoice_terms', e.target.value)}
                      placeholder="1. Goods once sold will not be taken back.&#10;2. Interest @ 18% p.a. charged after due date.&#10;3. Subject to local jurisdiction."
                      className="w-full border border-slate-300 rounded p-2.5 font-mono text-xs outline-none focus:ring-1 focus:ring-brand-500 leading-relaxed"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      All points entered here will automatically be pre-filled on every new invoice. You can add, edit, or renumber points anytime.
                    </p>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Default Invoice Notes / Bank Remittance instructions:</label>
                    <textarea
                      rows={3}
                      value={companySettings.default_invoice_notes || ''}
                      onChange={(e) => updateCompanySetting('default_invoice_notes', e.target.value)}
                      placeholder="Please remit payment via NEFT/RTGS to Bank Account # ... IFSC ... or UPI business@upi"
                      className="w-full border border-slate-300 rounded p-2.5 text-xs outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div className="pt-2">
                    <label className="flex items-center space-x-2 text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(companySettings.default_tax_inclusive)}
                        onChange={(e) => updateCompanySetting('default_tax_inclusive', e.target.checked)}
                        className="w-4 h-4 rounded text-brand-600 border-slate-300"
                      />
                      <span className="font-medium">Default new items to Tax-Inclusive pricing (MRP mode)</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* 5. Quotation Defaults */}
            {activeCategory === 'Sales_Quotation_Defaults' && companySettings && company && (
              <div className="border border-slate-200 rounded-lg p-5 space-y-4 bg-white shadow-sm">
                <h3 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-2 flex items-center space-x-2">
                  <FileCheck className="w-4 h-4 text-brand-600" />
                  <span>Quotation Policies & Defaults</span>
                </h3>

                <div className="space-y-4 text-xs">
                  <div className="w-48">
                    <label className="block font-semibold text-slate-700 mb-1">Default Quotation Validity (Days):</label>
                    <input
                      type="number"
                      placeholder="30"
                      value={companySettings.quotation_validity_days ?? ''}
                      onChange={(e) =>
                        updateCompanySetting(
                          'quotation_validity_days',
                          (e.target.value === '' ? '' : Number(e.target.value)) as any
                        )
                      }
                      className="w-full border border-slate-300 rounded px-2.5 py-1 text-sm outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Default Quotation Terms & Conditions (Varun Systems):</label>
                    <textarea
                      rows={8}
                      value={
                        company.default_quotation_terms !== undefined && company.default_quotation_terms !== null && company.default_quotation_terms !== ''
                          ? company.default_quotation_terms
                          : `Terms &Conditions: No warranty for burn / Physical Damage.
1. Taxes: Inclusive of GST
2. Payment: 100% Advance along with PO
3. Validity: 7 Days
4. Delivery: 1 week form the date of PO
5. Installation and transport Included.`
                      }
                      onChange={(e) => updateCompanyField('default_quotation_terms', e.target.value)}
                      placeholder="Terms &Conditions: No warranty for burn / Physical Damage.&#10;1. Taxes: Inclusive of GST&#10;2. Payment: 100% Advance along with PO&#10;3. Validity: 7 Days&#10;4. Delivery: 1 week form the date of PO&#10;5. Installation and transport Included."
                      className="w-full border border-slate-300 rounded p-2.5 font-mono text-xs outline-none focus:ring-1 focus:ring-brand-500 leading-relaxed"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      All points entered here will automatically be pre-filled on every new quotation. You can add, edit, or renumber points anytime. You can also edit them per quotation while preparing it.
                    </p>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Default Quotation Notes / Scope of Supply:</label>
                    <textarea
                      rows={3}
                      value={companySettings.default_quotation_notes || ''}
                      onChange={(e) => updateCompanySetting('default_quotation_notes', e.target.value)}
                      placeholder="Thank you for your inquiry. Please find our best commercial quotation as detailed above."
                      className="w-full border border-slate-300 rounded p-2.5 text-xs outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 6. Numbering Sequences */}
            {activeCategory === 'Sales_Numbering_Sequences' && (
              <div className="border border-slate-200 rounded-lg p-5 space-y-4 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="font-bold text-sm text-slate-800 flex items-center space-x-2">
                    <ListOrdered className="w-4 h-4 text-brand-600" />
                    <span>Document Numbering Sequences</span>
                  </h3>
                  <span className="text-[11px] text-slate-500">Atomic anti-collision sequence tracking</span>
                </div>

                <p className="text-xs text-slate-500">
                  Configure prefix formats, fiscal year integration, and starting sequence counters for every document type.
                </p>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-semibold uppercase text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">Document Type</th>
                        <th className="py-2.5 px-3">Prefix</th>
                        <th className="py-2.5 px-3">Current #</th>
                        <th className="py-2.5 px-3">Padding</th>
                        <th className="py-2.5 px-3">Last Generated</th>
                        <th className="py-2.5 px-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sequences.map((seq) => {
                        const isEditing = editingSeqId === seq.id;
                        return (
                          <tr key={seq.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-semibold text-slate-800">
                              {seq.document_type.replace(/_/g, ' ')}
                            </td>
                            <td className="py-2.5 px-3 font-mono">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={seqFormData.prefix ?? seq.prefix}
                                  onChange={(e) => setSeqFormData({ ...seqFormData, prefix: e.target.value })}
                                  className="w-24 border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono"
                                />
                              ) : (
                                seq.prefix
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={seqFormData.current_number !== undefined ? seqFormData.current_number : seq.current_number}
                                  onChange={(e) =>
                                    setSeqFormData({
                                      ...seqFormData,
                                      current_number: (e.target.value === '' ? '' : Number(e.target.value)) as any,
                                    })
                                  }
                                  className="w-20 border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono"
                                />
                              ) : (
                                seq.current_number
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={seqFormData.padding_length !== undefined ? seqFormData.padding_length : seq.padding_length}
                                  onChange={(e) =>
                                    setSeqFormData({
                                      ...seqFormData,
                                      padding_length: (e.target.value === '' ? '' : Number(e.target.value)) as any,
                                    })
                                  }
                                  className="w-16 border border-slate-300 rounded px-1.5 py-0.5 text-xs"
                                />
                              ) : (
                                `${seq.padding_length} digits`
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-500">
                              {seq.last_generated_number || '-'}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {isEditing ? (
                                <div className="flex items-center justify-center space-x-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateSequence(seq.id)}
                                    className="px-2 py-0.5 bg-emerald-600 text-white rounded font-bold text-[10px]"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingSeqId(null)}
                                    className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px]"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingSeqId(seq.id);
                                    setSeqFormData({
                                      prefix: seq.prefix,
                                      current_number: seq.current_number,
                                      padding_length: seq.padding_length,
                                    });
                                  }}
                                  className="text-brand-600 hover:underline font-bold text-[11px]"
                                >
                                  Edit
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 7. Saving Paths by Category */}
            {activeCategory === 'Category_Save_Paths' && companySettings && (
              <div className="border border-slate-200 rounded-lg p-5 space-y-4 bg-white shadow-sm">
                <h3 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-2 flex items-center space-x-2">
                  <FolderOpen className="w-4 h-4 text-brand-600" />
                  <span>Local Drive Saving Paths by Document Category</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Set designated folders on your local computer or network drive for automatic PDF archiving. Every generated invoice, quotation, or purchase bill can be automatically mirrored to its respective directory.
                </p>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Invoices Save Folder Path:</label>
                    <input
                      type="text"
                      placeholder="e.g. C:\BusinessDocs\Invoices"
                      value={companySettings.invoice_save_path || ''}
                      onChange={(e) => updateCompanySetting('invoice_save_path', e.target.value)}
                      className="w-full border border-slate-300 rounded px-3 py-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Quotations Save Folder Path:</label>
                    <input
                      type="text"
                      placeholder="e.g. C:\BusinessDocs\Quotations"
                      value={companySettings.quotation_save_path || ''}
                      onChange={(e) => updateCompanySetting('quotation_save_path', e.target.value)}
                      className="w-full border border-slate-300 rounded px-3 py-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Purchase Orders & Bills Save Folder Path:</label>
                    <input
                      type="text"
                      placeholder="e.g. C:\BusinessDocs\Purchases"
                      value={companySettings.purchase_save_path || ''}
                      onChange={(e) => updateCompanySetting('purchase_save_path', e.target.value)}
                      className="w-full border border-slate-300 rounded px-3 py-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Reports & Financial Statements Save Folder Path:</label>
                    <input
                      type="text"
                      placeholder="e.g. C:\BusinessDocs\Reports"
                      value={companySettings.report_save_path || ''}
                      onChange={(e) => updateCompanySetting('report_save_path', e.target.value)}
                      className="w-full border border-slate-300 rounded px-3 py-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Automated Backups Save Folder Path:</label>
                    <input
                      type="text"
                      placeholder="e.g. D:\Backups\InvoiceManager"
                      value={companySettings.backup_save_path || ''}
                      onChange={(e) => updateCompanySetting('backup_save_path', e.target.value)}
                      className="w-full border border-slate-300 rounded px-3 py-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 8. Inventory Rules */}
            {activeCategory === 'Inventory_Rules' && companySettings && (
              <div className="border border-slate-200 rounded-lg p-5 space-y-4 bg-white shadow-sm">
                <h3 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-2">
                  Inventory Valuation & Control
                </h3>
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Inventory Valuation Costing Method:</label>
                    <select
                      value={companySettings.inventory_valuation_method}
                      onChange={(e) => updateCompanySetting('inventory_valuation_method', e.target.value as any)}
                      className="w-64 border border-slate-300 rounded px-3 py-1.5 text-sm bg-white"
                    >
                      <option value="FIFO">FIFO (First In First Out)</option>
                      <option value="WEIGHTED_AVERAGE">Weighted Average Costing</option>
                    </select>
                  </div>

                  <label className="flex items-center space-x-2 text-slate-700 cursor-pointer pt-2">
                    <input
                      type="checkbox"
                      checked={companySettings.allow_negative_stock}
                      onChange={(e) => updateCompanySetting('allow_negative_stock', e.target.checked)}
                      className="w-4 h-4 rounded text-brand-600 border-slate-300"
                    />
                    <span>Allow negative stock balance (Disabled by default to prevent selling phantom inventory)</span>
                  </label>
                </div>
              </div>
            )}

            {/* Standalone vs LAN Multi-User Setup */}
            {activeCategory === 'Deployment_Mode' && (
              <div className="space-y-5">
                {/* Mode Selector Card */}
                <div className="border border-slate-200 rounded-xl p-5 bg-white shadow-sm space-y-4">
                  <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-base text-slate-800 flex items-center space-x-2">
                        <Server className="w-5 h-5 text-brand-600" />
                        <span>Software Operating Mode</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Select how you want to use Enterprise Invoice Manager in your office.
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold border ${
                        lanRole === 'STANDALONE'
                          ? 'bg-blue-50 border-blue-200 text-blue-700'
                          : lanRole === 'LAN_HOST'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-purple-50 border-purple-200 text-purple-700'
                      }`}
                    >
                      {lanRole === 'STANDALONE'
                        ? 'Standalone Mode (Single PC)'
                        : lanRole === 'LAN_HOST'
                        ? 'Host (Main Office PC)'
                        : `Staff PC: ${lanStaffName || 'Staff'}`}
                    </span>
                  </div>

                  {/* Dedicated Quick Disconnect / Standalone Switch for Staff PC */}
                  {lanRole === 'LAN_CLIENT' && (
                    <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-purple-600 text-white rounded-lg shrink-0 mt-0.5">
                          <Monitor className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-bold text-sm text-purple-950 flex items-center space-x-2">
                            <span>Connected to Office Host: {lanHostIp || 'Office LAN'}</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-200 text-purple-900">
                              Staff: {lanStaffName || 'Staff Member'}
                            </span>
                          </div>
                          <p className="text-xs text-purple-700 mt-1">
                            Going home with your laptop or need offline access without the office network? Switch to Standalone Mode below.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={lanSaving}
                        onClick={handleDisconnectToStandalone}
                        className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow-md transition-all shrink-0 disabled:opacity-50"
                      >
                        {lanSaving ? <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" /> : <Monitor className="w-4 h-4 text-emerald-400" />}
                        <span>Disconnect &amp; Switch to Standalone Mode</span>
                      </button>
                    </div>
                  )}

                  {/* 1. Standalone Mode vs LAN Multi-User Mode */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div
                      onClick={() => {
                        setLanRole('STANDALONE');
                        setLanStatus(null);
                      }}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-start space-x-3.5 ${
                        lanRole === 'STANDALONE'
                          ? 'border-brand-600 bg-brand-50/60 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div
                        className={`p-2.5 rounded-lg shrink-0 ${
                          lanRole === 'STANDALONE' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <Monitor className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-sm text-slate-800">1. Standalone Mode</div>
                        <div className="text-xs text-slate-500 mt-1">
                          Single Computer mode. Zero network configuration, 100% offline data storage on this machine.
                        </div>
                      </div>
                    </div>

                    <div
                      onClick={() => {
                        if (lanRole === 'STANDALONE') setLanRole('LAN_HOST');
                        setLanStatus(null);
                      }}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-start space-x-3.5 ${
                        lanRole === 'LAN_HOST' || lanRole === 'LAN_CLIENT'
                          ? 'border-brand-600 bg-brand-50/60 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div
                        className={`p-2.5 rounded-lg shrink-0 ${
                          lanRole === 'LAN_HOST' || lanRole === 'LAN_CLIENT'
                            ? 'bg-brand-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-sm text-slate-800">2. LAN Multi-User Mode</div>
                        <div className="text-xs text-slate-500 mt-1">
                          Office Network mode. Connect staff computers directly to the Main PC with per-staff menu permissions.
                        </div>
                      </div>
                    </div>
                  </div>

                  {lanStatus && (
                    <div
                      className={`flex items-center space-x-2 text-xs font-semibold px-3.5 py-2.5 rounded-lg border ${
                        lanStatus.success
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}
                    >
                      {lanStatus.success ? (
                        <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                      )}
                      <span>{lanStatus.message}</span>
                    </div>
                  )}

                  {/* ================= 2. IF STANDALONE MODE ================= */}
                  {lanRole === 'STANDALONE' && (
                    <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-sm text-slate-800 flex items-center space-x-2">
                            <CheckCircle className="w-4 h-4 text-emerald-600" />
                            <span>Standalone Mode is Active</span>
                          </h4>
                          <p className="text-xs text-slate-600 mt-1">
                            The software runs completely offline on this computer. You can create invoices, manage quotations, inventory, and track payments without any network setup.
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-white p-3.5 rounded-lg border border-slate-200">
                        <div>
                          <span className="text-slate-400 font-medium block">Database Engine</span>
                          <span className="font-bold text-slate-800">Local Embedded Database (Zero Setup)</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-medium block">Access Port</span>
                          <span className="font-bold text-slate-800">Localhost 127.0.0.1 (Port 4200)</span>
                        </div>
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          disabled={lanSaving}
                          onClick={handleDisconnectToStandalone}
                          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm flex items-center space-x-1.5 disabled:opacity-50"
                        >
                          {lanSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                          <span>Continue with Standalone Mode</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ================= 3. IF LAN MULTI-USER MODE ================= */}
                  {(lanRole === 'LAN_HOST' || lanRole === 'LAN_CLIENT') && (
                    <div className="space-y-5 pt-2">
                      {/* Host vs Staff Sub-Option */}
                      <div className="flex items-center space-x-3 border-b border-slate-100 pb-3">
                        <span className="text-xs font-bold text-slate-700">Choose Computer Role:</span>
                        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-bold">
                          <button
                            type="button"
                            onClick={() => {
                              setLanRole('LAN_HOST');
                              setLanStatus(null);
                            }}
                            className={`px-4 py-1.5 rounded-md transition-all flex items-center space-x-1.5 ${
                              lanRole === 'LAN_HOST'
                                ? 'bg-white text-brand-700 shadow-sm font-bold'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <Server className="w-3.5 h-3.5" />
                            <span>Host (Main PC)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setLanRole('LAN_CLIENT');
                              setLanStatus(null);
                            }}
                            className={`px-4 py-1.5 rounded-md transition-all flex items-center space-x-1.5 ${
                              lanRole === 'LAN_CLIENT'
                                ? 'bg-white text-brand-700 shadow-sm font-bold'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <Users className="w-3.5 h-3.5" />
                            <span>Staff (Staff PC)</span>
                          </button>
                        </div>
                      </div>

                      {/* ================= 4. IF HOST (MAIN PC) ================= */}
                      {lanRole === 'LAN_HOST' && (
                        <div className="space-y-5">
                          {/* Host Network Configuration Card */}
                          <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200 space-y-3 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/60 pb-2">
                              <div>
                                <h4 className="font-bold text-emerald-950 flex items-center space-x-1.5">
                                  <Server className="w-4 h-4 text-emerald-700" />
                                  <span>Main Office PC (Host) Network Info</span>
                                </h4>
                                <p className="text-[11px] text-emerald-800/80 mt-0.5">
                                  Office staff will enter this IP Address and Port on their Staff PCs to connect.
                                </p>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="font-semibold text-emerald-900">Host Port:</span>
                                <input
                                  type="number"
                                  value={lanPort}
                                  onChange={(e) => setLanPort(Number(e.target.value) || 4200)}
                                  className="w-20 border border-emerald-300 rounded px-2 py-1 font-mono text-xs bg-white text-emerald-950 font-bold"
                                />
                              </div>
                            </div>

                            {/* Detected IP Addresses */}
                            <div>
                              <span className="font-semibold text-emerald-900 block mb-1.5">
                                Host IP Address (detected on office network):
                              </span>
                              {lanLocalIps.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {lanLocalIps.map((ip) => (
                                    <div
                                      key={ip}
                                      className="inline-flex items-center space-x-2 px-3 py-1.5 bg-white border border-emerald-300 rounded-lg font-mono font-bold text-emerald-900 shadow-sm"
                                    >
                                      <span>{ip}</span>
                                      <span className="text-slate-400 text-[11px] font-sans font-normal">Port {lanPort}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleCopyLanIp(ip)}
                                        className="px-2 py-0.5 text-[10px] font-sans font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
                                      >
                                        {copiedIp === ip ? 'Copied!' : 'Copy IP'}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-slate-600">
                                  Run <code className="px-1.5 py-0.5 bg-white rounded border">ipconfig</code> in Windows Command Prompt to view your office Wi-Fi/Ethernet IPv4 address.
                                </div>
                              )}
                            </div>

                            {/* Background & Auto-start checkboxes */}
                            <div className="pt-2 space-y-1.5 border-t border-emerald-200/70">
                              <label className="flex items-center space-x-2 text-emerald-950 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={lanMinimizeToTray}
                                  onChange={(e) => setLanMinimizeToTray(e.target.checked)}
                                  className="w-3.5 h-3.5 rounded text-emerald-600 border-emerald-300"
                                />
                                <span className="font-semibold">
                                  Run quietly in Windows System Tray when closing window (keeps staff PCs connected)
                                </span>
                              </label>
                              <label className="flex items-center space-x-2 text-emerald-950 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={lanAutoStartOnBoot}
                                  onChange={(e) => setLanAutoStartOnBoot(e.target.checked)}
                                  className="w-3.5 h-3.5 rounded text-emerald-600 border-emerald-300"
                                />
                                <span className="font-semibold">
                                  Start Office Host automatically in background when Windows boots
                                </span>
                              </label>
                            </div>

                            {/* Save Host Settings button */}
                            <div className="flex justify-end pt-1">
                              <button
                                type="button"
                                disabled={lanSaving}
                                onClick={() => handleSaveLanDesktopConfig(false, 'LAN_HOST')}
                                className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-sm flex items-center space-x-1.5 disabled:opacity-50"
                              >
                                {lanSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                <span>Save Host Network Settings</span>
                              </button>
                            </div>
                          </div>

                          {/* Staff Member Creation Form */}
                          <div className="p-5 bg-white rounded-xl border border-slate-200 space-y-4 shadow-sm">
                            <div className="border-b border-slate-100 pb-2.5">
                              <h4 className="font-bold text-sm text-slate-800 flex items-center space-x-2">
                                <Plus className="w-4 h-4 text-brand-600" />
                                <span>Create Staff Member &amp; Assign Menu Permissions</span>
                              </h4>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Enter a staff name (e.g. Ramesh) and choose which menus they can access. When they enter this name on their computer, the software will automatically recognize and apply these permissions.
                              </p>
                            </div>

                            <div className="space-y-3">
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                  Staff Member Name *
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. Ramesh, Priya, Billing Desk, Accounts"
                                  value={hostNewStaffName}
                                  onChange={(e) => setHostNewStaffName(e.target.value)}
                                  className="w-full sm:w-80 border border-slate-300 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                                />
                              </div>

                              <div>
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                                  <label className="text-xs font-bold text-slate-700">
                                    Allowed Menus for this Staff Member ({hostNewStaffMenus.length} selected):
                                  </label>
                                  <div className="flex items-center space-x-2 text-[11px]">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setHostNewStaffMenus([
                                          'invoices',
                                          'invoices_other',
                                          'quotations',
                                          'customers',
                                          'products',
                                        ])
                                      }
                                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-semibold"
                                    >
                                      Billing Staff (No Dashboard/Reports)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setHostNewStaffMenus([
                                          'invoices',
                                          'invoices_other',
                                          'quotations',
                                          'customers',
                                          'suppliers',
                                          'products',
                                          'purchases',
                                          'inventory',
                                          'payments',
                                        ])
                                      }
                                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-semibold"
                                    >
                                      Accounts &amp; Inventory
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setHostNewStaffMenus(
                                          permMenuCatalog.length > 0 ? permMenuCatalog.map((m) => m.id) : []
                                        )
                                      }
                                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-semibold"
                                    >
                                      Select All
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setHostNewStaffMenus([])}
                                      className="px-2 py-0.5 text-rose-600 hover:bg-rose-50 rounded font-semibold"
                                    >
                                      Clear
                                    </button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                                  {permMenuCatalog.map((m) => {
                                    const checked = hostNewStaffMenus.includes(m.id);
                                    return (
                                      <label
                                        key={m.id}
                                        className={`flex items-center space-x-2 p-1.5 rounded border cursor-pointer transition-colors ${
                                          checked
                                            ? 'bg-brand-50 border-brand-200 text-brand-950 font-semibold'
                                            : 'bg-white border-slate-200 text-slate-500'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() =>
                                            setHostNewStaffMenus((prev) =>
                                              prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]
                                            )
                                          }
                                          className="w-3.5 h-3.5 rounded text-brand-600"
                                        />
                                        <span className="truncate">{m.label}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="flex justify-end pt-1">
                                <button
                                  type="button"
                                  disabled={hostCreatingStaff || !hostNewStaffName.trim()}
                                  onClick={handleInitiateCreateStaff}
                                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm flex items-center space-x-1.5 disabled:opacity-50"
                                >
                                  {hostCreatingStaff ? (
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Plus className="w-3.5 h-3.5" />
                                  )}
                                  <span>Create Staff Member</span>
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Existing Staff Members List */}
                          <div className="p-5 bg-white rounded-xl border border-slate-200 space-y-4 shadow-sm">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                              <div>
                                <h4 className="font-bold text-sm text-slate-800 flex items-center space-x-2">
                                  <Users className="w-4 h-4 text-brand-600" />
                                  <span>Configured Office Staff Members ({permWorkstations.filter((w) => !w.is_admin && w.role !== 'ADMIN').length})</span>
                                </h4>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  Staff will automatically receive these permissions when they enter their name on their computer.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={loadWorkstationPermissions}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold flex items-center space-x-1"
                              >
                                <RefreshCw className={`w-3 h-3 ${permLoading ? 'animate-spin' : ''}`} />
                                <span>Refresh</span>
                              </button>
                            </div>

                            {permWorkstations.filter((w) => !w.is_admin && w.role !== 'ADMIN').length === 0 ? (
                              <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-lg">
                                No staff members created yet. Use the form above to add your office staff members by name.
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {permWorkstations.filter((w) => !w.is_admin && w.role !== 'ADMIN').map((ws) => {
                                  const isExpanded = expandedStaffId === ws.device_id;
                                  return (
                                    <div
                                      key={ws.device_id}
                                      className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/50 space-y-3 text-xs"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center space-x-2.5">
                                          <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xs uppercase">
                                            {(ws.device_name || 'S').charAt(0)}
                                          </div>
                                          <div>
                                            <div className="font-bold text-slate-800 flex items-center space-x-2">
                                              <span>{ws.device_name}</span>
                                              <span
                                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                  ws.is_admin
                                                    ? 'bg-purple-100 text-purple-800'
                                                    : 'bg-brand-100 text-brand-800'
                                                }`}
                                              >
                                                {ws.is_admin ? 'MD / Full Admin' : 'Staff Member'}
                                              </span>
                                            </div>
                                            <div className="text-[11px] text-slate-500">
                                              {ws.is_admin
                                                ? 'All menus allowed'
                                                : `${ws.allowed_menus?.length || 0} menus allowed (Dashboard & Reports ${
                                                    ws.allowed_menus?.includes('dashboard') ? 'visible' : 'hidden'
                                                  })`}
                                            </div>
                                          </div>
                                        </div>

                                        <div className="flex items-center space-x-2">
                                          <button
                                            type="button"
                                            onClick={() => setExpandedStaffId(isExpanded ? null : ws.device_id)}
                                            className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded text-[11px] font-semibold flex items-center space-x-1"
                                          >
                                            <span>{isExpanded ? 'Hide Permissions' : 'Edit Permissions'}</span>
                                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleInitiateDeleteWorkstation(ws)}
                                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                            title="Delete Staff Member"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </div>

                                      {/* Expanded Menu Editor */}
                                      {isExpanded && (
                                        <div className="pt-2 border-t border-slate-200 space-y-2.5">
                                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white p-3 rounded-lg border border-slate-200">
                                            {permMenuCatalog.map((m) => {
                                              const checked = ws.is_admin || ws.allowed_menus?.includes(m.id);
                                              return (
                                                <label
                                                  key={m.id}
                                                  className={`flex items-center space-x-1.5 p-1 rounded border cursor-pointer ${
                                                    checked
                                                      ? 'bg-brand-50/70 border-brand-200 text-brand-950 font-semibold'
                                                      : 'bg-slate-50 border-slate-200 text-slate-400'
                                                  }`}
                                                >
                                                  <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleWorkstationMenu(ws.device_id, m.id)}
                                                    className="w-3.5 h-3.5 rounded text-brand-600"
                                                  />
                                                  <span className="text-[11px] truncate">{m.label}</span>
                                                </label>
                                              );
                                            })}
                                          </div>

                                          <div className="flex justify-end">
                                            <button
                                              type="button"
                                              disabled={permSavingId === ws.device_id}
                                              onClick={() => handleInitiateSaveWorkstation(ws)}
                                              className="px-3 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-bold flex items-center space-x-1 shadow-sm disabled:opacity-50"
                                            >
                                              <Save className="w-3 h-3" />
                                              <span>{permSavingId === ws.device_id ? 'Saving...' : 'Save Permissions'}</span>
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* MD PIN Protection (Strict 4 Digits) */}
                          <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-xl space-y-2 text-xs">
                            <div className="flex items-center justify-between font-bold text-amber-950">
                              <span className="flex items-center space-x-1.5">
                                <Lock className="w-3.5 h-3.5 text-amber-700" />
                                <span>MD / Admin PIN Protection (4 Digits)</span>
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  permHasCustomPin ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {permHasCustomPin ? 'PIN Active (Custom 4-Digit PIN)' : 'PIN Active (Default: 1234)'}
                              </span>
                            </div>
                            <p className="text-[11px] text-amber-900/80">
                              A 4-digit PIN is strictly required before saving or changing any staff menu permissions. Default PIN is 1234. Change your 4-digit PIN below to keep it secret.
                            </p>
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              {permHasCustomPin && (
                                <input
                                  type="password"
                                  maxLength={4}
                                  placeholder="Current PIN (4 digits)"
                                  value={permCurrentPin}
                                  onChange={(e) => setPermCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                  className="border border-slate-300 rounded px-2.5 py-1 text-xs w-36 bg-white font-mono tracking-widest text-center"
                                />
                              )}
                              <input
                                type="password"
                                maxLength={4}
                                placeholder="New 4-digit PIN"
                                value={permNewPin}
                                onChange={(e) => setPermNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                className="border border-slate-300 rounded px-2.5 py-1 text-xs w-36 bg-white font-mono tracking-widest text-center"
                              />
                              <button
                                type="button"
                                disabled={permNewPin.length !== 4}
                                onClick={handleUpdateAdminPin}
                                className="px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-bold disabled:opacity-50"
                              >
                                {permHasCustomPin ? 'Change PIN' : 'Set Custom PIN'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ================= 5. IF STAFF (OFFICE STAFF PC) ================= */}
                      {lanRole === 'LAN_CLIENT' && (
                        <div className="p-5 bg-white rounded-xl border border-slate-200 space-y-4 shadow-sm text-xs">
                          <div className="border-b border-slate-100 pb-2.5">
                            <h4 className="font-bold text-sm text-slate-800 flex items-center space-x-2">
                              <Users className="w-4 h-4 text-brand-600" />
                              <span>Connect to Main Office PC</span>
                            </h4>
                            <p className="text-slate-500 mt-0.5">
                              Enter the Main PC&apos;s IP address and the Staff Name given to you by the Host/MD. The software will connect and recognize your assigned menu permissions.
                            </p>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="sm:col-span-2">
                              <label className="block font-bold text-slate-700 mb-1">
                                Main Office PC IP Address *
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. 192.168.1.100"
                                value={lanHostIp}
                                onChange={(e) => setLanHostIp(e.target.value)}
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 font-mono text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                              />
                            </div>

                            <div>
                              <label className="block font-bold text-slate-700 mb-1">Port</label>
                              <input
                                type="number"
                                placeholder="4200"
                                value={lanPort}
                                onChange={(e) => setLanPort(Number(e.target.value) || 4200)}
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 font-mono text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block font-bold text-slate-700 mb-1">
                              Your Staff Member Name *
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. Ramesh, Priya, Billing Desk 1"
                              value={lanStaffName}
                              onChange={(e) => setLanStaffName(e.target.value)}
                              className="w-full sm:w-80 border border-slate-300 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                            <p className="text-[11px] text-slate-500 mt-1">
                              Must match the name created by the Host. Your allowed menus (e.g. Invoices, Quotations) will automatically apply, and restricted menus (Dashboard, Reports) will remain hidden.
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                            <div className="flex items-center space-x-2">
                              <button
                                type="button"
                                onClick={handleTestLanHost}
                                disabled={lanTesting || !lanHostIp.trim()}
                                className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold disabled:opacity-50 transition-colors"
                              >
                                {lanTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Server className="w-3.5 h-3.5" />}
                                <span>Test Connection</span>
                              </button>

                              {lanConnectedUrl && (
                                <span className="text-[11px] text-slate-500">
                                  Active server: <code className="font-mono text-slate-700">{lanConnectedUrl}</code>
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              disabled={lanSaving || !lanHostIp.trim() || !lanStaffName.trim()}
                              onClick={() => handleSaveLanDesktopConfig(true, 'LAN_CLIENT')}
                              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm disabled:opacity-50 transition-colors"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${lanSaving ? 'animate-spin' : ''}`} />
                              <span>Save &amp; Connect to Main PC</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}



            {/* ================= SYSTEM DIAGNOSTICS & LOGS ================= */}
            {activeCategory === 'System_Diagnostics' && (
              <div className="space-y-5">
                <div className="border-b border-slate-200 pb-3">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                    <Activity className="w-4 h-4 text-brand-600" />
                    <span>System Diagnostics, Health &amp; Rotating Local Logs</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    View local application telemetry and download diagnostic packages for technical support.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-xl p-5 bg-white shadow-sm space-y-4">
                  <div className="font-bold text-sm text-slate-800">Local Telemetry Overview:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div>
                      <span className="text-slate-400 font-medium block">Application Version</span>
                      <span className="font-bold text-slate-800">Enterprise Invoice Manager v2.0.0</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium block">Database Persistence Engine</span>
                      <span className="font-bold text-slate-800 flex items-center space-x-1.5">
                        <span>{dbModeInfo?.type === 'postgres' ? 'PostgreSQL Local LAN' : 'SQLite WAL (Zero-Setup)'}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          Automatic
                        </span>
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium block">Operating Mode</span>
                      <span className="font-bold text-slate-800">{lanRole || 'STANDALONE'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium block">Rotating Local Logs</span>
                      <span className="font-bold text-slate-800">Active (Max 5 MB / 7-Day History)</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-xs text-slate-800">Export Diagnostics Package</div>
                      <div className="text-[11px] text-slate-500">
                        Generates a secure, sanitized ZIP containing system health data and recent application logs for customer support.
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={diagnosticsDownloading}
                      onClick={handleExportDiagnostics}
                      className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow-sm transition-colors shrink-0 disabled:opacity-50"
                    >
                      {diagnosticsDownloading ? <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" /> : <Download className="w-4 h-4 text-emerald-400" />}
                      <span>{diagnosticsDownloading ? 'Exporting...' : 'Export Diagnostics (.zip)'}</span>
                    </button>
                  </div>
                </div>

                {/* OFFLINE SOFTWARE UPDATER & MULTI-PC SYNCHRONIZATION */}
                <div className="border border-slate-200 rounded-xl p-5 bg-white shadow-sm space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <h4 className="font-bold text-sm text-slate-800 flex items-center space-x-2">
                      <RefreshCw className="w-4 h-4 text-brand-600" />
                      <span>Offline Software Updates &amp; Client Sync (Zero Reinstall)</span>
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Install updated features without uninstalling. Invoices, customers, stock, and network connections are 100% preserved.
                    </p>
                  </div>

                  {/* Data Safety Assurance Banner */}
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start space-x-2.5 text-xs text-emerald-900">
                    <Shield className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <span className="font-bold">Permanent Data &amp; Network Protection:</span>
                      <p className="text-[11px] text-emerald-800 leading-relaxed">
                        Updating the software updates only application features and options. Your database (invoices, customers, numbering sequences) and office LAN settings will <strong>never</strong> be deleted or reset. A safety backup of your database is created automatically prior to applying any update.
                      </p>
                    </div>
                  </div>

                  {/* Status Banner */}
                  {updateStatus && (
                    <div
                      className={`p-3 rounded-lg border text-xs flex items-start space-x-2 ${
                        updateStatus.success
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : 'bg-red-50 border-red-200 text-red-900'
                      }`}
                    >
                      {updateStatus.success ? (
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="font-bold">{updateStatus.message}</div>
                        {updateStatus.backupPath && (
                          <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                            Safety Backup saved: {updateStatus.backupPath}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Hidden File Input for Browser / Fallback Mode */}
                  <input
                    type="file"
                    ref={updateFileInputRef}
                    accept=".asar,.zip"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleInstallOfflineUpdate(file);
                      if (e.target) e.target.value = '';
                    }}
                  />

                  {/* Actions Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    {/* Action 1: Install Update File */}
                    <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="font-bold text-xs text-slate-800 flex items-center space-x-1.5">
                          <Upload className="w-3.5 h-3.5 text-brand-600" />
                          <span>Install Update Package (.asar)</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                          Select the updated <code className="bg-slate-200 px-1 rounded text-slate-700">app.asar</code> file from your pendrive or computer to upgrade this machine in 3 seconds.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={updateInstalling || lanUpdating}
                        onClick={() => {
                          const electronAPI = (window as any)?.electronAPI;
                          if (electronAPI?.installOfflineUpdate) {
                            handleInstallOfflineUpdate();
                          } else if (updateFileInputRef.current) {
                            updateFileInputRef.current.click();
                          }
                        }}
                        className="w-full inline-flex items-center justify-center space-x-2 px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
                      >
                        {updateInstalling ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                            <span>Installing Update &amp; Backing Up...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5" />
                            <span>Select &amp; Install Update File</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Action 2: LAN Direct Update or Export Package */}
                    {lanRole === 'LAN_CLIENT' ? (
                      <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 flex flex-col justify-between space-y-3">
                        <div>
                          <div className="font-bold text-xs text-slate-800 flex items-center space-x-1.5">
                            <Server className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Update Directly from Main PC</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                            Connected to Main PC at <code className="bg-emerald-100 text-emerald-800 px-1 rounded font-bold">{lanHostIp || 'Office Host'}:{lanPort}</code>. Pull the newest version directly over your office network.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={lanUpdating || updateInstalling}
                          onClick={handleUpdateFromLan}
                          className="w-full inline-flex items-center justify-center space-x-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
                        >
                          {lanUpdating ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                              <span>Downloading from Main PC...</span>
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Update from Main Office PC</span>
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 flex flex-col justify-between space-y-3">
                        <div>
                          <div className="font-bold text-xs text-slate-800 flex items-center space-x-1.5">
                            <FolderOpen className="w-3.5 h-3.5 text-blue-600" />
                            <span>Export Client Update Package</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                            Generate a 1-click update folder containing <code className="bg-slate-200 px-1 rounded text-slate-700">1-Click-Update.bat</code> and <code className="bg-slate-200 px-1 rounded text-slate-700">app.asar</code> to copy to your other computer.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={exportingPackage}
                          onClick={handleExportUpdatePackage}
                          className="w-full inline-flex items-center justify-center space-x-2 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
                        >
                          {exportingPackage ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                              <span>Exporting Package...</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-3.5 h-3.5" />
                              <span>Export Client Update Folder</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* DANGER ZONE: FACTORY RESET */}
            {activeCategory === 'Factory_Reset' && (
              <div className="space-y-4">
                <div className="border-b border-slate-200 pb-3">
                  <h3 className="text-sm font-bold text-red-700 flex items-center space-x-1.5">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <span>Danger Zone: Clear All Companies &amp; Data (Factory Reset)</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Reset the local database to a completely clean slate.
                  </p>
                </div>

                <div className="bg-red-50/70 border border-red-200 rounded-xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center space-x-2 text-red-700 font-bold text-sm">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    <span>Danger Zone: Clear All Companies &amp; Data (Factory Reset)</span>
                  </div>
                  <p className="text-xs text-red-600/90">
                    Permanently erase all companies, operating branches, invoices, customers, suppliers, inventory, and payment records. Preserves application settings in a pristine clean state.
                  </p>
                  <button
                    type="button"
                    onClick={handleResetAllData}
                    disabled={resetting}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all disabled:opacity-50"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>{resetting ? 'Resetting Data...' : 'Reset & Wipe All Data'}</span>
                  </button>
                </div>
              </div>
            )}
              </>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            {savedSuccess && (
              <div className="flex items-center space-x-1.5 text-emerald-600 text-xs font-bold">
                <CheckCircle className="w-4 h-4" />
                <span>All settings saved successfully!</span>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center space-x-1.5 disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{loading ? 'Saving...' : 'Save Configuration'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4-Digit MD PIN Authorization Modal */}
      {pinPromptState && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 border border-slate-200 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">{pinPromptState.title}</h3>
                <p className="text-[11px] text-slate-500">MD / Admin PIN Authorization</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {pinPromptState.description}
            </p>

            <div className="space-y-1.5">
              <div className="flex justify-center">
                <input
                  type="password"
                  maxLength={4}
                  autoFocus
                  value={pinPromptInput}
                  onChange={(e) => {
                    setPinPromptError('');
                    setPinPromptInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && pinPromptInput.length === 4) {
                      handleConfirmPinAction();
                    }
                  }}
                  placeholder="• • • •"
                  className="w-48 text-center text-2xl font-mono tracking-[0.5em] font-bold py-2 border-2 border-slate-300 focus:border-brand-600 rounded-xl outline-none transition-all shadow-inner bg-slate-50 focus:bg-white"
                />
              </div>

              {!permHasCustomPin && (
                <p className="text-[11px] text-amber-700 font-medium text-center">
                  Default initial PIN is <strong>1234</strong>
                </p>
              )}

              {pinPromptError && (
                <p className="text-xs text-rose-600 font-semibold text-center animate-in fade-in">
                  {pinPromptError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setPinPromptState(null);
                  setPinPromptInput('');
                  setPinPromptError('');
                }}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pinPromptInput.length !== 4 || pinPromptLoading}
                onClick={handleConfirmPinAction}
                className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm disabled:opacity-50 flex items-center space-x-1.5"
              >
                {pinPromptLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Authorize &amp; Save</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ModalPortal>
  );
};
