// src/renderer/views/LetterheadsView.tsx - Offline Letterhead Management, AI Local Reader, Per-Company Templates & Live Preview
import React, { useState, useEffect, useMemo, useRef } from 'react';
import Decimal from 'decimal.js';
import { LetterheadTemplate, LayoutConfiguration, Company, LetterheadOCRResult } from '../../shared/types';
import { api } from '../services/api';
import { convertAmountToWords } from '../../server/finance/numberToWords';
import {
  Stamp,
  Plus,
  Trash2,
  CheckCircle,
  Cpu,
  X,
  Sliders,
  Eye,
  RotateCcw,
  FileText,
  Info,
  Upload,
  FolderOpen,
  Building2,
  Sparkles,
  FileUp,
  ExternalLink,
} from 'lucide-react';

interface Props {
  companyId: string;
}

interface SampleItem {
  id: string;
  name: string;
  hsn: string;
  qty: number;
  unit: string;
  rate: number;
  gstRate: number;
}

const SAMPLE_INVENTORY_ITEMS: SampleItem[] = [
  {
    id: '1',
    name: 'High Performance Enterprise Server Rack 42U',
    hsn: '8471',
    qty: 2,
    unit: 'Nos',
    rate: 85000,
    gstRate: 18,
  },
  {
    id: '2',
    name: '24-Port Gigabit Managed Layer-3 Network Switch',
    hsn: '8517',
    qty: 4,
    unit: 'Pcs',
    rate: 14500,
    gstRate: 18,
  },
  {
    id: '3',
    name: 'Solid Copper Cat6 Shielded Cable (305m Roll)',
    hsn: '8544',
    qty: 6,
    unit: 'Rolls',
    rate: 6800,
    gstRate: 18,
  },
  {
    id: '4',
    name: 'Rackmount Smart Online UPS 3kVA with SNMP Card',
    hsn: '8504',
    qty: 1,
    unit: 'Set',
    rate: 45000,
    gstRate: 18,
  },
  {
    id: '5',
    name: 'Dual-Band WiFi 6 Industrial Access Point',
    hsn: '8517',
    qty: 8,
    unit: 'Pcs',
    rate: 8200,
    gstRate: 18,
  },
  {
    id: '6',
    name: 'Fiber Optic Patch Cord SC-LC Single Mode 10m',
    hsn: '8544',
    qty: 20,
    unit: 'Pcs',
    rate: 750,
    gstRate: 18,
  },
];

export const LetterheadsView: React.FC<Props> = ({ companyId }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [viewingCompanyId, setViewingCompanyId] = useState<string>(companyId);
  const [templates, setTemplates] = useState<LetterheadTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingTemplate, setEditingTemplate] = useState<Partial<LetterheadTemplate>>({});
  const [targetCompanyId, setTargetCompanyId] = useState<string>(companyId);
  const [companyInfo, setCompanyInfo] = useState<Company | null>(null);

  // Manual Layout Adjustment Parameters (in mm / pt)
  const [topMarginMm, setTopMarginMm] = useState<number>(45);
  const [bottomMarginMm, setBottomMarginMm] = useState<number>(35);
  const [leftMarginMm, setLeftMarginMm] = useState<number>(15);
  const [rightMarginMm, setRightMarginMm] = useState<number>(15);
  const [tableStartPt, setTableStartPt] = useState<number>(260);
  const [accentColor, setAccentColor] = useState<string>('#0284c7');
  const [stationeryMode, setStationeryMode] = useState<'DIGITAL' | 'PREPRINTED'>('DIGITAL');
  const [sampleItemCount, setSampleItemCount] = useState<number>(4);
  const [showGuidelines, setShowGuidelines] = useState<boolean>(true);

  // Offline AI / OCR Analysis & Local Template Upload
  const [ocrResult, setOcrResult] = useState<(LetterheadOCRResult & { suggested_name?: string }) | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [localFileName, setLocalFileName] = useState<string>('');
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string>('');
  const [showTemplateBackdrop, setShowTemplateBackdrop] = useState<boolean>(true);
  const localFileInputRef = useRef<HTMLInputElement>(null);

  // Quick Import New Template Modal (PDF / PNG / JPG)
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [importCompanyId, setImportCompanyId] = useState<string>(companyId);
  const [importName, setImportName] = useState<string>('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importOrientation, setImportOrientation] = useState<'AUTO' | 'PORTRAIT' | 'LANDSCAPE'>('AUTO');
  const [importSetDefault, setImportSetDefault] = useState<boolean>(false);
  const [importAutoDetect, setImportAutoDetect] = useState<boolean>(true);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importMessage, setImportMessage] = useState<string>('');

  // Keep synced when global active company changes
  useEffect(() => {
    if (companyId) {
      setViewingCompanyId(companyId);
      setTargetCompanyId(companyId);
      setImportCompanyId(companyId);
    }
  }, [companyId]);

  useEffect(() => {
    loadCompanies();
  }, [companyId]);

  useEffect(() => {
    if (viewingCompanyId) {
      loadTemplates(viewingCompanyId);
      loadCompanyInfo(viewingCompanyId);
    }
  }, [viewingCompanyId]);

  useEffect(() => {
    if (isModalOpen && targetCompanyId) {
      loadCompanyInfo(targetCompanyId);
    }
  }, [isModalOpen, targetCompanyId]);

  // Cleanup object URL on unmount / change
  useEffect(() => {
    return () => {
      if (localPreviewUrl && localPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  const loadCompanies = async () => {
    try {
      const comps = await api.getCompanies();
      setCompanies(comps);
    } catch (err) {
      console.error(err);
    }
  };

  const loadTemplates = async (cid: string) => {
    setLoading(true);
    try {
      const data = await api.getLetterheads(cid);
      setTemplates(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadCompanyInfo = async (cid: string) => {
    try {
      const comp = await api.getCompany(cid);
      setCompanyInfo(comp);
    } catch (err) {
      console.error(err);
    }
  };

  const applyZonesToControls = (data: LetterheadOCRResult) => {
    if (data?.detected_zones?.header_box?.y_end) {
      const detectedTopMm = Math.round(data.detected_zones.header_box.y_end * 0.352778);
      setTopMarginMm(Math.min(100, Math.max(15, detectedTopMm + 4)));
    }
    if (data?.detected_zones?.footer_box?.y_start) {
      const pageH = data.recommended_orientation === 'LANDSCAPE' ? 595 : 842;
      const detectedBottomMm = Math.round((pageH - data.detected_zones.footer_box.y_start) * 0.352778);
      setBottomMarginMm(Math.min(80, Math.max(15, detectedBottomMm + 4)));
    }
    if (data?.detected_zones?.left_margin) {
      const detectedLeftMm = Math.round(data.detected_zones.left_margin * 0.352778);
      setLeftMarginMm(Math.min(35, Math.max(8, detectedLeftMm)));
    }
    if (data?.detected_zones?.right_margin) {
      const detectedRightMm = Math.round(data.detected_zones.right_margin * 0.352778);
      setRightMarginMm(Math.min(35, Math.max(8, detectedRightMm)));
    }
    if (data?.detected_zones?.printable_area?.top) {
      const suggestedTableTop = Math.min(380, Math.max(200, data.detected_zones.printable_area.top + 85));
      setTableStartPt(suggestedTableTop);
    }
  };

  const openCalibrationModal = async (tpl?: LetterheadTemplate) => {
    await loadCompanies();
    if (localPreviewUrl && localPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(localPreviewUrl);
    }
    setLocalPreviewUrl('');
    setLocalFileName('');

    const ownerCompanyId = tpl?.company_id || viewingCompanyId || companyId;
    setTargetCompanyId(ownerCompanyId);

    if (tpl) {
      setEditingTemplate({ ...tpl });
      const cfg = tpl.layout_config;
      if (cfg) {
        setTableStartPt(Math.min(380, Math.max(200, cfg.table_top_y || 260)));
        const rawTopMm = cfg.invoice_number?.y
          ? Math.round(cfg.invoice_number.y * 0.352778)
          : cfg.table_top_y
          ? Math.round(cfg.table_top_y * 0.352778 - 35)
          : 45;
        setTopMarginMm(Math.min(100, Math.max(15, rawTopMm)));
        const rawBottomMm = cfg.table_bottom_margin
          ? Math.round(cfg.table_bottom_margin * 0.352778)
          : 35;
        setBottomMarginMm(Math.min(80, Math.max(15, rawBottomMm)));
        if (cfg.customer_name?.x) {
          setLeftMarginMm(Math.min(35, Math.max(8, Math.round(cfg.customer_name.x * 0.352778))));
        }
      }
      if (tpl.file_path && tpl.id && (tpl.file_type === 'PNG' || tpl.file_type === 'JPG')) {
        setLocalPreviewUrl(api.getLetterheadFileUrl(ownerCompanyId, tpl.id));
      }
    } else {
      setEditingTemplate({
        name: 'Corporate Stationery Template',
        file_type: 'PDF',
        page_size: 'A4',
        orientation: 'PORTRAIT',
        is_default: templates.length === 0,
      });
      setTopMarginMm(45);
      setBottomMarginMm(35);
      setLeftMarginMm(15);
      setRightMarginMm(15);
      setTableStartPt(260);
      setAccentColor('#0284c7');
      setStationeryMode('DIGITAL');
    }
    setOcrResult(null);
    setShowTemplateBackdrop(true);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!editingTemplate.name) {
      alert('Template name is required');
      return;
    }
    const saveCompanyId = targetCompanyId || viewingCompanyId || companyId;
    if (!saveCompanyId) {
      alert('Please select a target company for this template');
      return;
    }

    // Build LayoutConfiguration from manual calibration inputs
    const updatedLayoutConfig: LayoutConfiguration = {
      id: editingTemplate.layout_config?.id || 'layout-' + Date.now(),
      template_id: editingTemplate.id || '',
      invoice_number: { x: 400, y: Math.max(110, Math.round(topMarginMm * 2.83465)), fontSize: 10, alignment: 'left' },
      invoice_date: { x: 400, y: Math.max(130, Math.round(topMarginMm * 2.83465) + 18), fontSize: 10, alignment: 'left' },
      due_date: { x: 400, y: Math.max(150, Math.round(topMarginMm * 2.83465) + 36), fontSize: 10, alignment: 'left' },
      customer_name: { x: Math.round(leftMarginMm * 2.83465), y: Math.max(110, Math.round(topMarginMm * 2.83465)), fontSize: 10, alignment: 'left' },
      billing_address: { x: Math.round(leftMarginMm * 2.83465), y: Math.max(128, Math.round(topMarginMm * 2.83465) + 18), fontSize: 9, alignment: 'left', width: 280 },
      shipping_address: { x: Math.round(leftMarginMm * 2.83465), y: Math.max(170, Math.round(topMarginMm * 2.83465) + 60), fontSize: 9, alignment: 'left', width: 280 },
      place_of_supply: { x: 400, y: Math.max(170, Math.round(topMarginMm * 2.83465) + 54), fontSize: 10, alignment: 'left' },
      customer_gstin: { x: Math.round(leftMarginMm * 2.83465), y: Math.max(200, Math.round(topMarginMm * 2.83465) + 85), fontSize: 10, alignment: 'left' },
      table_top_y: tableStartPt,
      table_bottom_margin: Math.round(bottomMarginMm * 2.83465),
      table_columns: {
        sr_no: { width: 30, label: 'Sr' },
        item_name: { width: 170, label: 'Item & Description' },
        hsn_sac: { width: 55, label: 'HSN/SAC' },
        qty: { width: 45, label: 'Qty' },
        rate: { width: 55, label: 'Rate (₹)' },
        discount: { width: 45, label: 'Disc' },
        taxable: { width: 60, label: 'Taxable (₹)' },
        gst: { width: 50, label: 'GST %' },
        total: { width: 65, label: 'Total (₹)' },
      },
      total_taxable_value: { x: 500, y: 640, fontSize: 10, alignment: 'right' },
      cgst: { x: 500, y: 655, fontSize: 10, alignment: 'right' },
      sgst: { x: 500, y: 670, fontSize: 10, alignment: 'right' },
      igst: { x: 500, y: 685, fontSize: 10, alignment: 'right' },
      round_off: { x: 500, y: 700, fontSize: 10, alignment: 'right' },
      grand_total: { x: 500, y: 720, fontSize: 12, alignment: 'right' },
      amount_in_words: { x: Math.round(leftMarginMm * 2.83465), y: 640, fontSize: 9, alignment: 'left', width: 340 },
      bank_details: { x: Math.round(leftMarginMm * 2.83465), y: 680, fontSize: 8, alignment: 'left', width: 250 },
      terms_conditions: { x: Math.round(leftMarginMm * 2.83465), y: 740, fontSize: 8, alignment: 'left', width: 320 },
      signature: { x: 440, y: 760, fontSize: 10, alignment: 'center' },
      footer: { x: 297, y: 815, fontSize: 8, alignment: 'center' },
    };

    const payload = {
      ...editingTemplate,
      layout_config: updatedLayoutConfig,
    };

    try {
      const originalCompanyId = editingTemplate.company_id || viewingCompanyId;
      if (editingTemplate.id && saveCompanyId === originalCompanyId) {
        await api.updateLetterhead(saveCompanyId, editingTemplate.id, payload);
      } else {
        const { id: _ignoredId, ...createPayload } = payload as any;
        await api.createLetterhead(saveCompanyId, createPayload);
      }
      setIsModalOpen(false);
      setEditingTemplate({});
      setOcrResult(null);
      if (saveCompanyId !== viewingCompanyId) {
        setViewingCompanyId(saveCompanyId);
      } else {
        await loadTemplates(saveCompanyId);
      }
    } catch (err: any) {
      alert(err.message || 'Error saving template');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this letterhead template?')) return;
    try {
      await api.deleteLetterhead(viewingCompanyId, id);
      await loadTemplates(viewingCompanyId);
    } catch (err: any) {
      alert(err.message || 'Error deleting template');
    }
  };

  const handleRunOcr = async () => {
    setIsAnalyzing(true);
    try {
      const cid = targetCompanyId || viewingCompanyId || companyId;
      const data = await api.analyzeLetterheadPath(cid, editingTemplate.file_path || '');
      setOcrResult(data);
      applyZonesToControls(data);
      if (data.recommended_orientation) {
        setEditingTemplate((prev) => ({
          ...prev,
          orientation: prev.orientation || data.recommended_orientation,
        }));
      }
    } catch (err: any) {
      alert(err.message || 'Offline OCR analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleLocalFileAnalyze = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const cid = targetCompanyId || viewingCompanyId || companyId;
    setIsAnalyzing(true);
    setLocalFileName(file.name);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('target_company_id', cid);

      const data = await api.analyzeLetterheadFile(cid, formData);
      setOcrResult(data);
      applyZonesToControls(data);

      setEditingTemplate((prev) => {
        const defaultName = !prev.name || prev.name === 'Corporate Stationery Template';
        const cleanTitle =
          data.suggested_name ||
          (data.detected_entities?.company_name ? `${data.detected_entities.company_name} Letterhead` : prev.name);
        return {
          ...prev,
          name: defaultName ? cleanTitle || 'Imported Letterhead Template' : prev.name,
          file_path: data.stored_file_path || prev.file_path,
          file_type: data.detected_file_type || prev.file_type || 'PDF',
          orientation: data.recommended_orientation || prev.orientation || 'PORTRAIT',
        };
      });

      if (localPreviewUrl && localPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(localPreviewUrl);
      }
      if (file.type.startsWith('image/') || /\.(png|jpe?g)$/i.test(file.name)) {
        setLocalPreviewUrl(URL.createObjectURL(file));
      } else {
        setLocalPreviewUrl('');
      }
    } catch (err: any) {
      alert(err.message || 'Could not analyze selected template file');
    } finally {
      setIsAnalyzing(false);
      e.target.value = '';
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) {
      alert('Please choose a PDF, PNG, or JPG letterhead file from your computer.');
      return;
    }
    const cid = importCompanyId || viewingCompanyId || companyId;
    if (!cid) {
      alert('Please select a target company.');
      return;
    }

    setIsImporting(true);
    setImportMessage('');
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('target_company_id', cid);
      if (importName.trim()) formData.append('name', importName.trim());
      if (importOrientation !== 'AUTO') formData.append('orientation', importOrientation);
      formData.append('is_default', String(importSetDefault));
      formData.append('auto_detect', String(importAutoDetect));

      const result = await api.importLetterhead(cid, formData);
      setIsImportModalOpen(false);
      setImportFile(null);
      setImportName('');
      setViewingCompanyId(cid);
      await loadTemplates(cid);

      const detectedSummary = [
        result.analysis?.detected_entities?.company_name && `Company: ${result.analysis.detected_entities.company_name}`,
        result.analysis?.detected_entities?.gstin && `GSTIN: ${result.analysis.detected_entities.gstin}`,
      ]
        .filter(Boolean)
        .join(' • ');

      setImportMessage(
        `Template "${result.template.name}" (${result.template.file_type}) imported to Letterheads & Templates.${
          detectedSummary ? ` AI Read: ${detectedSummary}` : ''
        }`
      );
    } catch (err: any) {
      alert(err.message || 'Failed to import template');
    } finally {
      setIsImporting(false);
    }
  };

  // Sample Inventory Calculations for Real-Time Verification Preview (Decimal-safe)
  const activeItems = useMemo(() => {
    return SAMPLE_INVENTORY_ITEMS.slice(0, sampleItemCount);
  }, [sampleItemCount]);

  const previewCalculations = useMemo(() => {
    let subtotalDec = new Decimal(0);
    let cgstDec = new Decimal(0);
    let sgstDec = new Decimal(0);

    activeItems.forEach((item) => {
      const itemTaxable = new Decimal(item.qty).mul(item.rate);
      subtotalDec = subtotalDec.add(itemTaxable);
      const gstAmount = itemTaxable.mul(item.gstRate).div(100);
      cgstDec = cgstDec.add(gstAmount.div(2));
      sgstDec = sgstDec.add(gstAmount.div(2));
    });

    const totalTaxDec = cgstDec.add(sgstDec);
    const grandTotalDec = subtotalDec.add(totalTaxDec);

    return {
      subtotal: subtotalDec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
      cgst: cgstDec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
      sgst: sgstDec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
      totalTax: totalTaxDec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
      grandTotal: grandTotalDec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
      grandTotalStr: grandTotalDec.toFixed(2),
    };
  }, [activeItems]);

  const viewingCompany = companies.find((c) => c.id === viewingCompanyId);

  return (
    <div className="p-6 space-y-5 overflow-y-auto max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight flex items-center space-x-2.5">
            <div className="p-2 bg-brand-50 dark:bg-brand-950 text-brand-600 rounded-lg">
              <Stamp className="w-5 h-5" />
            </div>
            <span>Letterhead Templates & Print Overlay Engine</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Design digital PDF letterheads, read local PDF/image templates with offline AI, and manage distinct stationery per company
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Per-Company Template Filter */}
          {companies.length > 0 && (
            <div className="flex items-center space-x-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs">
              <Building2 className="w-3.5 h-3.5 text-brand-600 shrink-0" />
              <span className="text-slate-500 font-semibold hidden sm:inline">Company:</span>
              <select
                value={viewingCompanyId}
                onChange={(e) => setViewingCompanyId(e.target.value)}
                className="bg-transparent font-bold text-slate-800 dark:text-slate-100 outline-none cursor-pointer max-w-[190px]"
                title="Switch company to view or create company-specific templates"
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id} className="bg-white dark:bg-slate-800">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setImportCompanyId(viewingCompanyId || companyId);
              setImportFile(null);
              setImportName('');
              setImportOrientation('AUTO');
              setImportSetDefault(templates.length === 0);
              setImportAutoDetect(true);
              setIsImportModalOpen(true);
            }}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-bold transition-all cursor-pointer"
          >
            <FileUp className="w-4 h-4 text-brand-600" />
            <span>Import New Template (PDF / Img)</span>
          </button>

          <button
            type="button"
            onClick={() => openCalibrationModal()}
            className="inline-flex items-center space-x-1.5 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-md shadow-brand-500/10 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Letterhead Template</span>
          </button>
        </div>
      </div>

      {importMessage && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{importMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setImportMessage('')}
            className="text-emerald-600 hover:text-emerald-800 font-bold ml-3"
          >
            ×
          </button>
        </div>
      )}

      {/* Templates Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-3 py-12 text-center text-xs text-slate-400">
            Loading letterhead templates for {viewingCompany?.name || 'company'}...
          </div>
        ) : templates.length === 0 ? (
          <div className="col-span-3 bg-white dark:bg-slate-800 p-12 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-3">
            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto text-slate-400">
              <Stamp className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
              No Letterheads Configured for {viewingCompany?.name || 'this Company'}
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Create a new letterhead template, let offline AI read your PDF/image stationery from a local folder, or import a PDF template directly.
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setImportCompanyId(viewingCompanyId || companyId);
                  setIsImportModalOpen(true);
                }}
                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold border border-slate-300 dark:border-slate-600"
              >
                <FileUp className="w-4 h-4" />
                <span>Import PDF / Image</span>
              </button>
              <button
                type="button"
                onClick={() => openCalibrationModal()}
                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-600 text-white rounded-lg text-xs font-bold"
              >
                <Plus className="w-4 h-4" />
                <span>Create First Template</span>
              </button>
            </div>
          </div>
        ) : (
          templates.map((tpl) => (
            <div
              key={tpl.id}
              className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-4 flex flex-col justify-between hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm text-slate-900 dark:text-white truncate pr-2">{tpl.name}</span>
                  {tpl.is_default && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 font-bold px-2 py-0.5 rounded-full flex items-center space-x-1 shrink-0">
                      <CheckCircle className="w-3 h-3" />
                      <span>Default</span>
                    </span>
                  )}
                </div>

                {viewingCompany && (
                  <div className="text-[10px] font-semibold text-brand-600 dark:text-brand-400 flex items-center space-x-1 mb-2">
                    <Building2 className="w-3 h-3" />
                    <span className="truncate">{viewingCompany.name}</span>
                  </div>
                )}

                <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 mt-2">
                  <div className="flex justify-between">
                    <span>File Type:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{tpl.file_type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Paper Size:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{tpl.page_size} ({tpl.orientation})</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Header Clearance:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {Math.round(tpl.layout_config?.table_top_y ? tpl.layout_config.table_top_y * 0.352778 : 45)} mm
                    </span>
                  </div>
                  {tpl.file_path && (
                    <div className="flex justify-between items-center pt-1">
                      <span>Stationery File:</span>
                      <a
                        href={api.getLetterheadFileUrl(viewingCompanyId, tpl.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center space-x-1 text-[11px] font-semibold text-brand-600 hover:underline truncate max-w-[170px]"
                        title={tpl.file_path}
                      >
                        <span className="truncate">{tpl.file_path.split(/[\\/]/).pop()}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-700 pt-3">
                <button
                  type="button"
                  onClick={() => openCalibrationModal(tpl)}
                  className="inline-flex items-center space-x-1.5 text-xs font-bold text-brand-600 dark:text-brand-400 hover:text-brand-700"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Calibrate & Live Preview</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(tpl.id)}
                  className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
                  title="Delete Template"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Calibration & Live Sample Verification Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-2 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-7xl h-[94vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-brand-100 dark:bg-brand-950 text-brand-600 rounded-lg">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-black text-sm text-slate-800 dark:text-slate-100">
                    Letterhead Template Designer & Manual Alignment
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Adjust top & bottom margins in real-time and verify against realistic sample inventory items
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body - 2 Columns (Controls on Left, Live A4 Sheet Preview on Right) */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
              {/* Left Column: Manual Controls & Settings (5 cols) */}
              <div className="lg:col-span-5 p-5 overflow-y-auto space-y-5 border-r border-slate-200 dark:border-slate-800 text-xs">
                {/* Template Identity */}
                <div className="space-y-3 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/60">
                  <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                    <FileText className="w-3.5 h-3.5 text-brand-600" />
                    <span>Template Details</span>
                  </div>

                  {/* Per-Company Selection */}
                  {companies.length > 0 && (
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center space-x-1">
                        <Building2 className="w-3.5 h-3.5 text-brand-600" />
                        <span>Assign Template to Company *</span>
                      </label>
                      <select
                        value={targetCompanyId}
                        onChange={(e) => setTargetCompanyId(e.target.value)}
                        className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold"
                      >
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.gstin ? `(${c.gstin})` : ''}
                          </option>
                        ))}
                      </select>
                      {editingTemplate.id && targetCompanyId !== (editingTemplate.company_id || viewingCompanyId) && (
                        <p className="text-[10px] text-amber-600 mt-1">
                          Saving will create an independent copy of this template for the selected company.
                        </p>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Template Name *
                    </label>
                    <input
                      type="text"
                      value={editingTemplate.name || ''}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                      placeholder="e.g. Standard Corporate Stationery"
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Print Mode
                      </label>
                      <select
                        value={stationeryMode}
                        onChange={(e) => setStationeryMode(e.target.value as any)}
                        className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                      >
                        <option value="DIGITAL">Digital PDF (Header & Footer Printed)</option>
                        <option value="PREPRINTED">Preprinted Stationery Overlay (Blank Margins)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Accent Color
                      </label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="color"
                          value={accentColor}
                          onChange={(e) => setAccentColor(e.target.value)}
                          className="w-8 h-8 rounded border border-slate-300 cursor-pointer p-0.5"
                        />
                        <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">{accentColor}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Letterhead Stationery File Path (Optional PDF/PNG background)
                    </label>
                    <input
                      type="text"
                      placeholder="c:\letterheads\stationery_overlay.pdf"
                      value={editingTemplate.file_path || ''}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, file_path: e.target.value })}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 font-mono text-[11px] bg-white dark:bg-slate-800"
                    />
                  </div>

                  {/* Offline AI Read from Local Folder */}
                  <div className="p-3 bg-brand-50/70 dark:bg-brand-950/30 border border-brand-200 dark:border-brand-800 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-brand-600" />
                        <span>AI Read Template from Local Folder</span>
                      </span>
                      {editingTemplate.file_type && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                          {editingTemplate.file_type}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      Pick any local PDF, PNG, or JPG letterhead from your folder. Offline AI extracts header/footer zones, GSTIN, PAN, IFSC, UPI & calibrates margins automatically.
                    </p>
                    <input
                      ref={localFileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                      onChange={handleLocalFileAnalyze}
                      className="hidden"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isAnalyzing}
                        onClick={() => localFileInputRef.current?.click()}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold text-[11px] shadow-xs disabled:opacity-50 cursor-pointer"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>{isAnalyzing ? 'Reading Template with AI...' : 'Choose Local File & AI Read'}</span>
                      </button>
                      {localFileName && (
                        <span className="text-[10px] text-slate-600 dark:text-slate-300 truncate max-w-[180px]" title={localFileName}>
                          {localFileName}
                        </span>
                      )}
                    </div>
                  </div>

                  <label className="flex items-center space-x-2 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(editingTemplate.is_default)}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, is_default: e.target.checked })}
                      className="rounded text-brand-600"
                    />
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Set as Default Print Template for Invoices & Quotations
                    </span>
                  </label>
                </div>

                {/* Manual Alignment Controls */}
                <div className="space-y-4 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/60">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                      <Sliders className="w-3.5 h-3.5 text-brand-600" />
                      <span>Manual Margin & Zone Alignment</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setTopMarginMm(45);
                        setBottomMarginMm(35);
                        setLeftMarginMm(15);
                        setRightMarginMm(15);
                        setTableStartPt(260);
                      }}
                      className="text-[10px] text-brand-600 hover:underline flex items-center space-x-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  </div>

                  {/* Top Margin Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">
                        Top Margin / Header Height (mm)
                      </label>
                      <span className="font-mono font-bold text-brand-600 bg-brand-50 dark:bg-brand-950 px-2 py-0.5 rounded">
                        {topMarginMm} mm
                      </span>
                    </div>
                    <input
                      type="range"
                      min="15"
                      max="100"
                      value={topMarginMm}
                      onChange={(e) => setTopMarginMm(Number(e.target.value))}
                      className="w-full accent-brand-600 cursor-pointer"
                    />
                    <div className="text-[10px] text-slate-400">
                      Space reserved for preprinted company letterhead header
                    </div>
                  </div>

                  {/* Bottom Margin Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">
                        Bottom Margin / Footer Height (mm)
                      </label>
                      <span className="font-mono font-bold text-brand-600 bg-brand-50 dark:bg-brand-950 px-2 py-0.5 rounded">
                        {bottomMarginMm} mm
                      </span>
                    </div>
                    <input
                      type="range"
                      min="15"
                      max="80"
                      value={bottomMarginMm}
                      onChange={(e) => setBottomMarginMm(Number(e.target.value))}
                      className="w-full accent-brand-600 cursor-pointer"
                    />
                    <div className="text-[10px] text-slate-400">
                      Space reserved for letterhead footer, bank notes, or signatory
                    </div>
                  </div>

                  {/* Side Margins */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Left Margin</span>
                        <span className="font-mono text-brand-600">{leftMarginMm} mm</span>
                      </div>
                      <input
                        type="range"
                        min="8"
                        max="35"
                        value={leftMarginMm}
                        onChange={(e) => setLeftMarginMm(Number(e.target.value))}
                        className="w-full accent-brand-600 cursor-pointer"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Right Margin</span>
                        <span className="font-mono text-brand-600">{rightMarginMm} mm</span>
                      </div>
                      <input
                        type="range"
                        min="8"
                        max="35"
                        value={rightMarginMm}
                        onChange={(e) => setRightMarginMm(Number(e.target.value))}
                        className="w-full accent-brand-600 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Table Start Position */}
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between items-center">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">
                        Table Start Y Position (pt)
                      </label>
                      <span className="font-mono font-bold text-brand-600 bg-brand-50 dark:bg-brand-950 px-2 py-0.5 rounded">
                        {tableStartPt} pt
                      </span>
                    </div>
                    <input
                      type="range"
                      min="200"
                      max="380"
                      value={tableStartPt}
                      onChange={(e) => setTableStartPt(Number(e.target.value))}
                      className="w-full accent-brand-600 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Sample Inventory Verification Options */}
                <div className="space-y-3 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/60">
                  <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                    <span className="flex items-center space-x-1.5">
                      <Eye className="w-3.5 h-3.5 text-brand-600" />
                      <span>Sample Inventory Verification</span>
                    </span>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showGuidelines}
                        onChange={(e) => setShowGuidelines(e.target.checked)}
                        className="rounded text-brand-600 text-[10px]"
                      />
                      <span className="text-[10px] text-slate-500 font-medium">Show Guide Lines</span>
                    </label>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Inventory Items to Preview:</span>
                    <div className="flex items-center space-x-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5">
                      {[2, 4, 6].map((count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() => setSampleItemCount(count)}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold ${
                            sampleItemCount === count
                              ? 'bg-brand-600 text-white shadow-sm'
                              : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                          }`}
                        >
                          {count} Items
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Offline AI / OCR Section */}
                <div className="border border-slate-200 dark:border-slate-700/60 rounded-xl p-3.5 bg-slate-50 dark:bg-slate-800/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5 font-bold text-slate-800 dark:text-slate-200">
                      <Cpu className="w-3.5 h-3.5 text-brand-600" />
                      <span>Offline OCR Auto-Calibration</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRunOcr}
                      disabled={isAnalyzing}
                      className="px-2.5 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded-md font-bold disabled:opacity-50 text-[11px] transition-colors cursor-pointer"
                    >
                      {isAnalyzing ? 'Detecting Zones...' : 'Auto-Detect Zones'}
                    </button>
                  </div>

                  {ocrResult ? (
                    <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1.5 text-[11px]">
                      <div className="font-semibold text-emerald-600">
                        Analysis Confidence: {(ocrResult.confidence * 100).toFixed(0)}% (Offline AI Engine)
                      </div>
                      <div className="text-slate-500">
                        Detected Header: {ocrResult.detected_zones?.header_box?.y_end ?? 120}pt | Footer: {ocrResult.detected_zones?.footer_box?.y_start ?? 750}pt
                        {ocrResult.recommended_orientation ? ` | ${ocrResult.recommended_orientation}` : ''}
                      </div>
                      {(ocrResult.detected_entities?.company_name ||
                        ocrResult.detected_entities?.gstin ||
                        ocrResult.detected_entities?.pan ||
                        ocrResult.detected_entities?.bank_ifsc ||
                        ocrResult.detected_entities?.upi_id) && (
                        <div className="pt-1 border-t border-slate-100 dark:border-slate-700 text-[10px] text-slate-600 dark:text-slate-300 space-y-0.5">
                          {ocrResult.detected_entities.company_name && (
                            <div>Detected Name: <strong>{ocrResult.detected_entities.company_name}</strong></div>
                          )}
                          {ocrResult.detected_entities.gstin && (
                            <div>GSTIN: <strong className="font-mono">{ocrResult.detected_entities.gstin}</strong></div>
                          )}
                          {ocrResult.detected_entities.pan && (
                            <div>PAN: <strong className="font-mono">{ocrResult.detected_entities.pan}</strong></div>
                          )}
                          {ocrResult.detected_entities.bank_ifsc && (
                            <div>IFSC: <strong className="font-mono">{ocrResult.detected_entities.bank_ifsc}</strong></div>
                          )}
                          {ocrResult.detected_entities.upi_id && (
                            <div>UPI: <strong className="font-mono">{ocrResult.detected_entities.upi_id}</strong></div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400">
                      Run offline OCR or choose a local file above to automatically detect existing preprinted headers, footers, entities, and margins.
                    </p>
                  )}
                </div>
              </div>

              {/* Right Column: Live Real-Time A4 Letterhead Sheet Preview (7 cols) */}
              <div className="lg:col-span-7 bg-slate-100 dark:bg-slate-950 p-4 sm:p-6 overflow-y-auto flex flex-col items-center justify-start">
                {/* Preview Toolbar */}
                <div className="w-full max-w-[560px] flex items-center justify-between mb-3 text-xs text-slate-500">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-700 dark:text-slate-300">A4 Live Print Sheet</span>
                    <span className="bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded text-[10px] font-mono">
                      210 × 297 mm
                    </span>
                    {editingTemplate.file_path && (
                      <span className="bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded text-[10px] font-semibold">
                        {editingTemplate.file_type || 'PDF'} Attached
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-3 text-[11px] text-slate-400">
                    {localPreviewUrl && (
                      <label className="flex items-center space-x-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showTemplateBackdrop}
                          onChange={(e) => setShowTemplateBackdrop(e.target.checked)}
                          className="rounded text-brand-600"
                        />
                        <span>Show Backdrop</span>
                      </label>
                    )}
                    <span>
                      Mode: <span className="font-bold text-brand-600">{stationeryMode}</span>
                    </span>
                  </div>
                </div>

                {/* Simulated A4 Paper (560px width, aspect ratio 1:1.414 -> approx 792px height) */}
                <div
                  className="w-full max-w-[560px] min-h-[780px] bg-white text-slate-900 shadow-2xl rounded-sm border border-slate-300 relative select-none flex flex-col justify-between overflow-hidden"
                  style={{
                    paddingLeft: `${leftMarginMm * 1.6}px`,
                    paddingRight: `${rightMarginMm * 1.6}px`,
                    paddingTop: `${topMarginMm * 1.6}px`,
                    paddingBottom: `${bottomMarginMm * 1.6}px`,
                  }}
                >
                  {/* Uploaded Image Stationery Backdrop */}
                  {localPreviewUrl && showTemplateBackdrop && (
                    <img
                      src={localPreviewUrl}
                      alt="Uploaded letterhead stationery"
                      className="absolute inset-0 w-full h-full object-contain opacity-25 pointer-events-none"
                    />
                  )}

                  {/* Visual Guideline Overlays (if enabled) */}
                  {showGuidelines && (
                    <>
                      {/* Top Header Guideline */}
                      <div
                        className="absolute left-0 right-0 border-b border-dashed border-rose-400 pointer-events-none z-10"
                        style={{ top: `${topMarginMm * 1.6}px` }}
                      >
                        <span className="absolute right-2 -top-4 text-[9px] font-mono font-bold text-rose-600 bg-rose-50 px-1 rounded shadow-xs">
                          Header Zone ({topMarginMm}mm)
                        </span>
                      </div>

                      {/* Bottom Footer Guideline */}
                      <div
                        className="absolute left-0 right-0 border-t border-dashed border-rose-400 pointer-events-none z-10"
                        style={{ bottom: `${bottomMarginMm * 1.6}px` }}
                      >
                        <span className="absolute right-2 -bottom-4 text-[9px] font-mono font-bold text-rose-600 bg-rose-50 px-1 rounded shadow-xs">
                          Footer Zone ({bottomMarginMm}mm)
                        </span>
                      </div>
                    </>
                  )}

                  {/* Header Content */}
                  <div className="relative z-10">
                    {stationeryMode === 'DIGITAL' ? (
                      /* Digital PDF Header (Render selected company's header or AI detected info) */
                      <div className="pb-3 border-b-2" style={{ borderColor: accentColor }}>
                        <div className="flex justify-between items-start">
                          <div>
                            <h2 className="text-base font-black tracking-tight" style={{ color: accentColor }}>
                              {(
                                companyInfo?.name ||
                                ocrResult?.detected_entities?.company_name ||
                                'YOUR COMPANY NAME'
                              ).toUpperCase()}
                            </h2>
                            <p className="text-[10px] text-slate-600 leading-tight mt-0.5">
                              {companyInfo?.registered_address || 'Registered Business Address, City, State - PIN Code'}
                            </p>
                            <div className="text-[9px] text-slate-500 mt-1 space-x-2">
                              <span>
                                GSTIN: <strong>{companyInfo?.gstin || ocrResult?.detected_entities?.gstin || 'Not Configured'}</strong>
                              </span>
                              <span>|</span>
                              <span>
                                PAN: <strong>{companyInfo?.pan || ocrResult?.detected_entities?.pan || 'Not Configured'}</strong>
                              </span>
                              <span>|</span>
                              <span>Phone: {companyInfo?.phone || ocrResult?.detected_entities?.phone || '—'}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span
                              className="inline-block text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded text-white"
                              style={{ backgroundColor: accentColor }}
                            >
                              TAX INVOICE
                            </span>
                            <div className="text-[9px] text-slate-500 mt-1 font-mono">
                              ORIGINAL FOR RECIPIENT
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Preprinted Stationery Header (Blank spacing placeholder) */
                      <div className="text-center py-2 bg-amber-50/70 border border-dashed border-amber-300 rounded mb-2">
                        <span className="text-[10px] font-bold text-amber-800">
                          Preprinted Physical Letterhead Area ({topMarginMm}mm Clearance)
                        </span>
                      </div>
                    )}

                    {/* Invoice Meta & Customer Info Section */}
                    <div className="grid grid-cols-2 gap-4 py-2.5 text-[10px] border-b border-slate-200">
                      <div>
                        <div className="font-bold text-slate-500 uppercase tracking-wider text-[8px] mb-0.5">
                          BILLED TO:
                        </div>
                        <div className="font-bold text-slate-800 text-[11px]">Sample Client Enterprise Pvt Ltd</div>
                        <div className="text-slate-600 text-[9px] leading-tight mt-0.5">
                          Sample Industrial Estate, Phase 1, City, State - 400001
                        </div>
                        <div className="text-[9px] text-slate-600 mt-0.5">
                          GSTIN: <strong>27AAAAA0000A1Z5</strong> | State: 27 - Maharashtra
                        </div>
                      </div>

                      <div className="space-y-1 text-right">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Invoice Number:</span>
                          <span className="font-bold font-mono">INV-2026-0001</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Invoice Date:</span>
                          <span className="font-medium">09-Nov-2026</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Due Date:</span>
                          <span className="font-medium">24-Nov-2026</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Place of Supply:</span>
                          <span className="font-medium">
                            {companyInfo ? `${companyInfo.state_code} - ${companyInfo.state}` : '27 - Maharashtra'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Sample Inventory Items Table */}
                    <div className="mt-2.5">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="text-[9px] font-bold text-white uppercase" style={{ backgroundColor: accentColor }}>
                            <th className="py-1 px-1.5 text-center w-6">#</th>
                            <th className="py-1 px-1.5">Item Description</th>
                            <th className="py-1 px-1 text-center w-12">HSN</th>
                            <th className="py-1 px-1 text-center w-12">Qty</th>
                            <th className="py-1 px-1 text-right w-16">Rate (₹)</th>
                            <th className="py-1 px-1 text-center w-10">GST</th>
                            <th className="py-1 px-1.5 text-right w-20">Total (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-[9px]">
                          {activeItems.map((item, idx) => {
                            const taxable = new Decimal(item.qty).mul(item.rate);
                            const total = taxable.add(taxable.mul(item.gstRate).div(100)).toNumber();
                            return (
                              <tr key={item.id} className="hover:bg-slate-50">
                                <td className="py-1.5 px-1.5 text-center font-mono text-slate-400">{idx + 1}</td>
                                <td className="py-1.5 px-1.5">
                                  <div className="font-bold text-slate-800 leading-tight">{item.name}</div>
                                  <div className="text-[8px] text-slate-400">Sample catalog specification preview</div>
                                </td>
                                <td className="py-1.5 px-1 text-center font-mono text-slate-500">{item.hsn}</td>
                                <td className="py-1.5 px-1 text-center font-bold">
                                  {item.qty} {item.unit}
                                </td>
                                <td className="py-1.5 px-1 text-right font-mono">
                                  {item.rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="py-1.5 px-1 text-center font-mono text-slate-600">{item.gstRate}%</td>
                                <td className="py-1.5 px-1.5 text-right font-mono font-bold text-slate-800">
                                  {total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Financial Summary & Tax Breakdown */}
                    <div className="mt-3 pt-2 border-t border-slate-200 grid grid-cols-12 gap-3 text-[9px]">
                      <div className="col-span-7 space-y-2">
                        <div>
                          <div className="font-bold text-slate-500 uppercase tracking-wider text-[8px]">
                            AMOUNT IN WORDS:
                          </div>
                          <div className="font-medium text-slate-700 italic text-[8.5px]">
                            {convertAmountToWords(previewCalculations.grandTotalStr)}
                          </div>
                        </div>

                        <div className="bg-slate-50 p-2 rounded border border-slate-200 text-[8px] space-y-0.5">
                          <div className="font-bold text-slate-700">Bank Details for Direct NEFT / RTGS / IMPS:</div>
                          <div>
                            Bank: <strong>{companyInfo?.bank_name || 'Not Configured'}</strong> | A/C:{' '}
                            <strong>{companyInfo?.bank_account_no || '—'}</strong>
                          </div>
                          <div>
                            IFSC: <strong>{companyInfo?.bank_ifsc || ocrResult?.detected_entities?.bank_ifsc || '—'}</strong>
                            {companyInfo?.bank_branch ? ` | Branch: ${companyInfo.bank_branch}` : ''}
                          </div>
                          <div>
                            UPI ID: <strong>{companyInfo?.upi_id || ocrResult?.detected_entities?.upi_id || 'business@upi'}</strong>
                          </div>
                        </div>

                        <div className="text-[8px] text-slate-500">
                          <strong>Terms & Conditions:</strong> {companyInfo?.default_invoice_terms || 'Payment due within 15 days of invoice date. Goods once sold will not be taken back.'}
                        </div>
                      </div>

                      <div className="col-span-5 space-y-1 text-right">
                        <div className="flex justify-between text-slate-600">
                          <span>Taxable Value:</span>
                          <span className="font-mono">
                            ₹ {previewCalculations.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>GST (18%):</span>
                          <span className="font-mono">
                            ₹ {previewCalculations.totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>Round Off:</span>
                          <span className="font-mono">₹ 0.00</span>
                        </div>
                        <div
                          className="flex justify-between items-center py-1.5 px-2 rounded font-black text-[11px] text-white mt-1"
                          style={{ backgroundColor: accentColor }}
                        >
                          <span>GRAND TOTAL:</span>
                          <span className="font-mono">
                            ₹ {previewCalculations.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>

                        <div className="pt-4 text-center">
                          <div className="text-[8px] text-slate-400">For {companyInfo?.name || 'Your Business Name'}</div>
                          <div className="h-7"></div>
                          <div className="text-[8px] font-bold text-slate-700 border-t border-slate-300 pt-0.5 inline-block px-4">
                            Authorized Signatory
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer Content */}
                  <div className="relative z-10">
                    {stationeryMode === 'DIGITAL' ? (
                      <div className="pt-2 border-t border-slate-200 text-center text-[8px] text-slate-400 flex justify-between">
                        <span>This is a computer-generated tax invoice and requires no physical seal.</span>
                        <span className="font-mono">Page 1 of 1</span>
                      </div>
                    ) : (
                      <div className="text-center py-1.5 bg-amber-50/70 border border-dashed border-amber-300 rounded">
                        <span className="text-[9px] font-bold text-amber-800">
                          Preprinted Physical Letterhead Footer Area ({bottomMarginMm}mm Clearance)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs text-slate-500">
                <Info className="w-4 h-4 text-brand-600" />
                <span>
                  All invoices and quotations using this template will automatically conform to these exact margin boundaries.
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-md shadow-brand-500/20 cursor-pointer flex items-center space-x-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Save Template & Calibration</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import New Template Modal (PDF / PNG / JPG -> Letterheads & Templates) */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleImportSubmit}
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
              <div className="flex items-center space-x-2">
                <Upload className="w-4 h-4 text-brand-600" />
                <h2 className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
                  Import New Letterhead Template (PDF / PNG / JPG)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Target Company *
                </label>
                <select
                  value={importCompanyId}
                  onChange={(e) => setImportCompanyId(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 font-semibold"
                  required
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.gstin ? `(${c.gstin})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Choose PDF / Image Template File *
                </label>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setImportFile(f);
                    if (f && !importName.trim()) {
                      setImportName(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim());
                    }
                  }}
                  className="w-full border border-dashed border-brand-400 rounded-lg p-3 bg-brand-50/40 dark:bg-slate-800 cursor-pointer"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Supports A4/Letter PDF stationery files as well as PNG & JPG scans up to 25 MB.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Template Name
                  </label>
                  <input
                    type="text"
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    placeholder="Auto-filled from file name"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Page Orientation
                  </label>
                  <select
                    value={importOrientation}
                    onChange={(e) => setImportOrientation(e.target.value as any)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800"
                  >
                    <option value="AUTO">Auto-Detect from File</option>
                    <option value="PORTRAIT">Portrait (A4)</option>
                    <option value="LANDSCAPE">Landscape (A4)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={importAutoDetect}
                    onChange={(e) => setImportAutoDetect(e.target.checked)}
                    className="rounded text-brand-600"
                  />
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Auto-detect header, footer, margins & GST details via Offline AI
                  </span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={importSetDefault}
                    onChange={(e) => setImportSetDefault(e.target.checked)}
                    className="rounded text-brand-600"
                  />
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Set as default letterhead template for this company
                  </span>
                </label>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isImporting}
                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm disabled:opacity-50"
              >
                <FileUp className="w-3.5 h-3.5" />
                <span>{isImporting ? 'Importing PDF/Image...' : 'Import to Letterheads & Templates'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
