
import React, { useState, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";

// Declare libraries for TypeScript
declare const pdfjsLib: any;
declare const JSZip: any;
declare const PDFLib: any;

interface OCRResult {
  phan_loai_tai_lieu: string;
  ten_san_pham: string;
  lan_ban_hanh: string;
  ngay_ban_hanh: string;
  so_lo: string;
  stt_bo_phan?: string;
  stt?: string;
  loai_mau?: string;
  mau_sac?: string;
  ten_file_de_xuat: string;
}

interface FileItem {
  id: string;
  file: File;
  preview: string | null;
  status: 'pending' | 'processing' | 'completed' | 'error';
  downloaded: boolean;
  result?: OCRResult;
  error?: string;
}

const App: React.FC = () => {
  const [fileList, setFileList] = useState<FileItem[]>([]);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [splittingFile, setSplittingFile] = useState<FileItem | null>(null);
  const [previewItem, setPreviewItem] = useState<FileItem | null>(null);
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [splitRanges, setSplitRanges] = useState<string[]>(['']);
  const [isSplitting, setIsSplitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateProposedFileName = (res: OCRResult): string => {
    let cleanName = res.ten_san_pham.replace(/:/g, ';');
    
    // Áp dụng định dạng Title Case cho các thành phần không phải viết tắt
    const toTitleCase = (str: string) => {
      if (!str) return "";
      // Các cụm từ viết tắt phổ biến cần giữ nguyên HOA
      const upperWords = ["VNBĐ", "VNM", "HHDN", "HC", "VBĐ", "VNC", "HM", "VN", "VBP", "VNBP", "TPBVSK", "GMP", "QLCL"];
      return str.split(' ').map(word => {
        if (!word) return "";
        if (upperWords.includes(word.toUpperCase())) return word.toUpperCase();
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }).join(' ');
    };

    if (res.phan_loai_tai_lieu === 'PTLKQ') {
      return `Phiếu trả lời kết quả ${toTitleCase(cleanName)}.pdf`;
    }

    if (res.phan_loai_tai_lieu === 'PKN') {
      let baseName = "";
      if (res.loai_mau === 'TP') baseName = `${toTitleCase(cleanName)} lô ${res.so_lo}`;
      else if (res.loai_mau === 'BTP') {
        const btpName = cleanName.replace(/\([^)]*\)/g, '').trim();
        baseName = `BTP ${toTitleCase(btpName)} lô ${res.so_lo}`;
      }
      else if (res.loai_mau === 'NL') baseName = `NL ${res.stt || ''} ${toTitleCase(cleanName)}`;
      else baseName = `${toTitleCase(cleanName)} lô ${res.so_lo}`;

      if (res.mau_sac === 'hồng') {
        return `${baseName} (hồng).pdf`;
      }
      return `${baseName}.pdf`;
    }

    if (res.phan_loai_tai_lieu === 'BCSPKPH') {
      return `${res.stt_bo_phan || ''} - ${toTitleCase(cleanName)} lô ${res.so_lo}.pdf`;
    }

    if (['ĐMVT', 'QTSX', 'QTĐG'].includes(res.phan_loai_tai_lieu)) {
      return `Lần ${res.lan_ban_hanh} - ${res.ngay_ban_hanh} - ${res.phan_loai_tai_lieu} ${toTitleCase(cleanName)} lô ${res.so_lo}.pdf`;
    }

    return res.ten_file_de_xuat;
  };

  const updateFileResult = (id: string, field: keyof OCRResult, value: string) => {
    setFileList(prev => {
      const newList = prev.map(item => {
        if (item.id !== id || !item.result) return item;
        const newResult = { ...item.result, [field]: value };
        newResult.ten_file_de_xuat = generateProposedFileName(newResult);
        return { ...item, result: newResult };
      });
      
      // Update previewItem if it's the one being edited
      if (previewItem && previewItem.id === id) {
        const updatedItem = newList.find(item => item.id === id);
        if (updatedItem) setPreviewItem(updatedItem);
      }
      
      return newList;
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles: FileItem[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const id = Math.random().toString(36).substring(7);
      
      let preview: string | null = null;
      try {
        if (file.type === 'application/pdf') {
          preview = await generatePdfPreview(file);
        } else if (file.type.startsWith('image/')) {
          preview = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(file);
          });
        }
      } catch (err) {
        console.error("Preview error:", err);
      }

      newFiles.push({
        id,
        file,
        preview,
        status: 'pending',
        downloaded: false
      });
    }

    setFileList(prev => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const generatePdfPreview = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const typedArray = new Uint8Array(event.target?.result as ArrayBuffer);
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          const pdf = await pdfjsLib.getDocument(typedArray).promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: context, viewport: viewport }).promise;
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const renderAllPdfPages = async (file: File) => {
    setIsLoadingPages(true);
    setPdfPages([]);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const typedArray = new Uint8Array(arrayBuffer);
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf = await pdfjsLib.getDocument(typedArray).promise;
      const pages: string[] = [];
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        pages.push(canvas.toDataURL('image/jpeg', 0.7));
      }
      setPdfPages(pages);
    } catch (err) {
      console.error("Error rendering pages:", err);
      alert("Không thể hiển thị nội dung PDF");
    } finally {
      setIsLoadingPages(false);
    }
  };

  const openSplitModal = (item: FileItem) => {
    setSplittingFile(item);
    setSplitRanges(['']);
    renderAllPdfPages(item.file);
  };

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const processOneFile = async (item: FileItem, attempt = 0): Promise<void> => {
    if (!item.preview) {
      updateFileStatus(item.id, 'error', undefined, "Không có hình ảnh để xử lý");
      return;
    }

    updateFileStatus(item.id, 'processing');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const base64Data = item.preview.split(',')[1];

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
            {
              text: `Bạn là hệ thống OCR chuyên dụng cho tài liệu GMP ngành dược.
Nhiệm vụ của bạn trích xuất thông tin từ HEADER trang đầu tiên hoặc toàn bộ trang nếu là Phiếu Kiểm Nghiệm.

YÊU CẦU PHÂN LOẠI & TRÍCH XUẤT:
1. PHÂN LOẠI TÀI LIỆU (Trường "phan_loai_tai_lieu"):
- Nếu chứa "PHIẾU KIỂM NGHIỆM" hoặc "CERTIFICATE OF ANALYSIS" -> "PKN"
- Nếu chứa "PHIẾU TRẢ LỜI KẾT QUẢ" -> "PTLKQ"
- Nếu chứa "ĐỊNH MỨC VẬT TƯ" -> "ĐMVT"
- Nếu chứa "QUY TRÌNH SẢN XUẤT" -> "QTSX"
- Nếu chứa "QUY TRÌNH ĐÓNG GÓI" -> "QTĐG"
- Nếu chứa "BÁO CÁO SẢN PHẨM KHÔNG PHÙ HỢP" -> "BCSPKPH"

2. QUY TẮC RIÊNG CHO PKN HOẶC PTLKQ:
- LOẠI MẪU: Trích xuất từ "Số kiểm nghiệm:". Nếu chứa "/TP" -> "TP", "/BTP" -> "BTP", "/NL" hoặc "NL" -> "NL". Trả về giá trị (TP, BTP, NL) vào trường "loai_mau".
- MÀU SẮC PHIẾU: Xác định nền của tài liệu là màu hồng hay màu trắng. Trả về 'hồng' hoặc 'trắng' vào trường 'mau_sac'.
- STT (Chỉ cho NL): Lấy phần số trước dấu gạch ngang đầu tiên trong "Số kiểm nghiệm:" (Ví dụ: "0723-26NL" lấy "0723").
- TÊN SẢN PHẨM (Viết tắt):
  + TRÍCH XUẤT: Tìm từ nhãn "Tên mẫu" hoặc "Mẫu kiểm nghiệm".
  + CƠ CHẾ VIẾT TẮT & CHUẨN HÓA: 
    - Đối với PTLKQ: TUYỆT ĐỐI KHÔNG áp dụng từ điển viết tắt. Giữ nguyên từ gốc.
    - Đối với các loại khác (TP, BTP, NL): Đối chiếu Tên mẫu với "Từ điển viết tắt" bên dưới để thay thế.
    - Chuẩn hóa Casing: Tất cả các từ (trừ từ điển viết tắt) được viết Hoa Chữ Cái Đầu (Title Case).
    - Các từ viết tắt sẵn (TPBVSK, GMP...): Giữ nguyên định dạng viết hoa.
    - Xử lý ký tự đặc biệt: Nếu trong tên có dấu hai chấm ":" PHẢI đổi thành dấu chấm phẩy ";".
  + TỪ ĐIỂN VIẾT TẮT (CHỈ ÁP DỤNG CHO TP, BTP, NL):
    - "Viên nén bao đường" -> "VNBĐ"
    - "Viên nang mềm" -> "VNM"
    - "Hoạt huyết dưỡng não" -> "HHDN"
    - "BTP hoàn cứng" -> "HC"
    - "Viên bao đường" -> "VBĐ"
    - "Viên nang cứng" -> "VNC"
    - "Hoàn mềm" -> "HM"
    - "Viên nén" -> "VN"
    - "Viên bao phim" -> "VBP"
    - "Viên nén bao phim" -> "VNBP"
  + QUY TẮC QUAN TRỌNG: 
    1. Đối với BTP: LOẠI BỎ hoàn toàn các thông tin trong ngoặc đơn.
    2. Đối với các loại mẫu khác: GIỮ NGUYÊN thông tin trong ngoặc đơn.
    3. Tuyệt đối không viết tắt Boganic Forte thành BF.
- SỐ LÔ: Trích xuất từ nhãn "Lô sản xuất" hoặc "Lô SX".

3. QUY TẮC CHO CÁC LOẠI KHÁC (BCSPKPH, ĐMVT, QTSX, QTĐG):
- TÊN SẢN PHẨM: Dòng chữ IN HOA ngay dưới dòng phân loại. Thay ":" thành "-". 
- LẦN BAN HÀNH, NGÀY BAN HÀNH, SỐ LÔ, STT BỘ PHẬN: Trích xuất từ các nhãn tương ứng.

4. TÊN FILE ĐỀ XUẤT:
- Nếu là PTLKQ: "Phiếu trả lời kết quả {Tên sản phẩm}.pdf"
- Nếu là PKN:
  + Nếu là TP: "{Tên sản phẩm} lô {Số lô}{ (hồng) nếu mau_sac là hồng}.pdf"
  + Nếu là BTP: "BTP {Tên sản phẩm} lô {Số lô}{ (hồng) nếu mau_sac là hồng}.pdf"
  + Nếu là NL: "NL {STT} {Tên sản phẩm}{ (hồng) nếu mau_sac là hồng}.pdf"
- Nếu là BCSPKPH: "{STT_bo_phan} - {Tên sản phẩm} lô {Số lô}.pdf"
- Nếu là ĐMVT/QTSX/QTĐG: "Lần {Lần ban hành} - {Ngay ban hành} - {Loại} {Tên sản phẩm} lô {Số lô}.pdf"

Trả về JSON chính xác theo schema yêu cầu.`,
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              phan_loai_tai_lieu: { type: Type.STRING },
              ten_san_pham: { type: Type.STRING },
              lan_ban_hanh: { type: Type.STRING },
              ngay_ban_hanh: { type: Type.STRING },
              so_lo: { type: Type.STRING },
              stt_bo_phan: { type: Type.STRING },
              stt: { type: Type.STRING },
              loai_mau: { type: Type.STRING },
              mau_sac: { type: Type.STRING },
              ten_file_de_xuat: { type: Type.STRING },
            },
            required: ["phan_loai_tai_lieu", "ten_san_pham", "ten_file_de_xuat"]
          }
        },
      });

      const data = JSON.parse(response.text);
      updateFileStatus(item.id, 'completed', data);
    } catch (err: any) {
      if ((err.status === 429 || err.message?.includes('429')) && attempt < 2) {
        await delay(3000 * (attempt + 1));
        return processOneFile(item, attempt + 1);
      }
      updateFileStatus(item.id, 'error', undefined, err.message || "Lỗi xử lý");
    }
  };

  const updateFileStatus = (id: string, status: FileItem['status'], result?: OCRResult, error?: string) => {
    setFileList(prev => prev.map(item => 
      item.id === id ? { ...item, status, result, error } : item
    ));
  };

  const parsePageRange = (range: string, maxPages: number): number[] => {
    const pages = new Set<number>();
    const parts = range.split(',').map(p => p.trim());
    
    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(num => parseInt(num.trim()));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = Math.max(1, start); i <= Math.min(maxPages, end); i++) {
            pages.add(i - 1);
          }
        }
      } else {
        const page = parseInt(part);
        if (!isNaN(page) && page >= 1 && page <= maxPages) {
          pages.add(page - 1);
        }
      }
    }
    return Array.from(pages).sort((a, b) => a - b);
  };

  const handleSplitPdf = async (autoProcess = true) => {
    if (!splittingFile) return;
    const validRanges = splitRanges.filter(r => r.trim() !== '');
    if (validRanges.length === 0) return;
    
    setIsSplitting(true);
    try {
      const existingPdfBytes = await splittingFile.file.arrayBuffer();
      const pdfDoc = await PDFLib.PDFDocument.load(existingPdfBytes);
      const totalPages = pdfDoc.getPageCount();
      
      const newItems: FileItem[] = [];

      for (const range of validRanges) {
        const pagesToKeep = parsePageRange(range, totalPages);
        if (pagesToKeep.length === 0) continue;

        const newPdfDoc = await PDFLib.PDFDocument.create();
        const copiedPages = await newPdfDoc.copyPages(pdfDoc, pagesToKeep);
        copiedPages.forEach((page: any) => newPdfDoc.addPage(page));
        
        const pdfBytes = await newPdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const newFileName = `[Tách ${range.replace(/,/g, '_')}] ${splittingFile.file.name}`;
        const newFile = new File([blob], newFileName, { type: 'application/pdf' });
        
        const id = Math.random().toString(36).substring(7);
        const preview = await generatePdfPreview(newFile);
        
        newItems.push({
          id,
          file: newFile,
          preview,
          status: 'pending',
          downloaded: false
        });
      }

      if (newItems.length > 0) {
        setFileList(prev => [...prev, ...newItems]);
        if (autoProcess) {
          for (const item of newItems) {
            processOneFile(item);
          }
        }
      }
      
      setSplittingFile(null);
      setSplitRanges(['']);
    } catch (err) {
      console.error("Split error:", err);
      alert("Lỗi khi tách file PDF");
    } finally {
      setIsSplitting(false);
    }
  };

  const addSplitRange = () => {
    setSplitRanges(prev => [...prev, '']);
  };

  const removeSplitRange = (index: number) => {
    if (splitRanges.length <= 1) {
      setSplitRanges(['']);
      return;
    }
    setSplitRanges(prev => prev.filter((_, i) => i !== index));
  };

  const updateSplitRange = (index: number, value: string) => {
    setSplitRanges(prev => prev.map((r, i) => i === index ? value : r));
  };

  const splitEachPage = () => {
    if (!splittingFile) return;
    const pages = pdfPages.length;
    const newRanges = Array.from({ length: pages }, (_, i) => (i + 1).toString());
    setSplitRanges(newRanges);
  };

  const splitTwoPages = () => {
    if (!splittingFile) return;
    const pages = pdfPages.length;
    const newRanges: string[] = [];
    for (let i = 1; i <= pages; i += 2) {
      if (i + 1 <= pages) {
        newRanges.push(`${i}-${i + 1}`);
      } else {
        newRanges.push(`${i}`);
      }
    }
    setSplitRanges(newRanges);
  };

  const markAsDownloaded = (ids: string[]) => {
    setFileList(prev => prev.map(item => 
      ids.includes(item.id) ? { ...item, downloaded: true } : item
    ));
  };

  const processAll = async () => {
    setIsProcessingAll(true);
    for (const item of fileList) {
      if (item.status === 'pending' || item.status === 'error') {
        await processOneFile(item);
      }
    }
    setIsProcessingAll(false);
  };

  const downloadFile = (item: FileItem) => {
    if (!item.result || !item.result.ten_file_de_xuat) return;
    const url = URL.createObjectURL(item.file);
    const link = document.createElement('a');
    link.href = url;
    link.download = item.result.ten_file_de_xuat;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    markAsDownloaded([item.id]);
  };

  const downloadAll = async () => {
    const completedItems = fileList.filter(item => item.status === 'completed' && item.result);
    if (completedItems.length === 0) return;

    setIsZipping(true);
    const zip = new JSZip();
    
    for (const item of completedItems) {
      const fileName = item.result!.ten_file_de_xuat;
      zip.file(fileName, item.file);
    }

    try {
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `GMP_DOCS_${new Date().getTime()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      markAsDownloaded(completedItems.map(i => i.id));
    } catch (err) {
      console.error("Zipping error:", err);
    } finally {
      setIsZipping(false);
    }
  };

  const clearList = () => {
    if (window.confirm("Xóa toàn bộ danh sách tệp? Thao tác này sẽ đặt lại toàn bộ quá trình.")) {
      setFileList([]);
      setSplittingFile(null);
      setPreviewItem(null);
      setPdfPages([]);
      setSplitRanges(['']);
      setIsProcessingAll(false);
      setIsZipping(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const processAllRenaming = async () => {
    const pendingItems = fileList.filter(f => f.status === 'pending' || f.status === 'error');
    if (pendingItems.length === 0) return;
    
    setIsProcessingAll(true);
    for (const item of pendingItems) {
      // Re-check status in case user interrupted or something
      await processOneFile(item);
    }
    setIsProcessingAll(false);
  };

  const startSplittingProcess = () => {
    const nextPdf = fileList.find(f => f.status === 'pending' && f.file.type === 'application/pdf');
    if (nextPdf) {
      openSplitModal(nextPdf);
    } else {
      alert("Không tìm thấy tệp PDF mới nào để tách.");
    }
  };

  const completedCount = fileList.filter(f => f.status === 'completed').length;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-extrabold text-slate-800 mb-2 tracking-tight">GMP Bulk OCR Rename</h1>
        <p className="text-slate-500 font-medium italic">Giải pháp trích xuất Header & Đổi tên hàng loạt cho hồ sơ dược phẩm</p>
      </header>

      {/* Upload Area */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8">
        <div 
          className="border-2 border-dashed border-slate-300 rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all group"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="mx-auto h-20 w-20 bg-blue-100 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <svg className="h-10 w-10 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-xl font-bold text-slate-700">Chọn hàng loạt file PDF hoặc Hình ảnh</p>
          <p className="mt-2 text-sm text-slate-500 text-center max-w-md">Kéo thả nhiều file tại đây để hệ thống tự động phân loại và chuẩn hóa tên file theo quy định GMP.</p>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            multiple
            accept="application/pdf,image/jpeg,image/png"
            onChange={handleFileChange} 
          />
        </div>

        {fileList.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-4 mt-6">
            <button
              onClick={processAllRenaming}
              disabled={isProcessingAll || fileList.filter(f => f.status === 'pending' || f.status === 'error').length === 0}
              className={`flex-1 py-4 px-6 rounded-xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2 ${
                isProcessingAll ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95 disabled:opacity-50'
              }`}
            >
              {isProcessingAll ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Đang xử lý đổi tên...
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Đổi tên file ({fileList.filter(f => f.status === 'pending' || f.status === 'error').length} tệp)
                </>
              )}
            </button>
            <button 
              onClick={startSplittingProcess}
              disabled={isProcessingAll || fileList.filter(f => f.status === 'pending' && f.file.type === 'application/pdf').length === 0}
              className="flex-1 px-6 py-4 bg-emerald-600 text-white rounded-xl font-bold text-lg shadow-lg hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758L12 12m0 0l2.879 2.879M12 12l2.879-2.879" />
              </svg>
              Tách file + Đổi tên
            </button>
          </div>
        )}
      </div>

      {/* Results List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              Danh sách tệp và Kết quả
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full uppercase tracking-wider">
                Tổng: {fileList.length}
              </span>
              {completedCount > 0 && (
                <span className="text-xs font-bold px-2.5 py-1 bg-emerald-100 text-emerald-600 rounded-full uppercase tracking-wider">
                  Xong: {completedCount}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={clearList}
              className="px-4 py-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all text-xs font-bold flex items-center gap-1.5 border border-transparent hover:border-red-100"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Xóa danh sách
            </button>
            {completedCount > 0 && (
              <button
                onClick={downloadAll}
                disabled={isZipping}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-900 transition-all shadow active:scale-95 disabled:opacity-50"
              >
                {isZipping ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                )}
                Tải về tất cả (.zip)
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-100">
                <th className="px-6 py-4 w-12">Xem</th>
                <th className="px-6 py-4">Thông tin File gốc</th>
                <th className="px-6 py-4">Kết quả trích xuất & Tên file mới</th>
                <th className="px-6 py-4 w-32 text-center">Trạng thái</th>
                <th className="px-6 py-4 w-48">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {fileList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-12 h-12 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="font-medium">Chưa có tệp nào được tải lên</p>
                    </div>
                  </td>
                </tr>
              ) : (
                fileList.map((item) => (
                  <tr key={item.id} className={`hover:bg-slate-50/50 transition-colors ${item.downloaded ? 'bg-slate-50/30 opacity-75' : ''}`}>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => setPreviewItem(item)}
                        title="Click để xem chi tiết"
                        className="w-12 h-16 bg-slate-100 rounded border border-slate-200 overflow-hidden shadow-sm relative group cursor-zoom-in hover:border-blue-400 hover:ring-2 hover:ring-blue-100 transition-all"
                      >
                        {item.preview && <img src={item.preview} className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" alt="Preview" />}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/5">
                          <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                          </svg>
                        </div>
                        {item.downloaded && (
                          <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center pointer-events-none">
                            <svg className="w-6 h-6 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="max-w-xs overflow-hidden">
                        <div className="flex items-center gap-1">
                          <p className={`text-sm font-bold truncate ${item.downloaded ? 'text-slate-500 line-through' : 'text-slate-700'}`}>{item.file.name}</p>
                          {item.downloaded && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1 rounded font-bold uppercase">Đã tải</span>}
                        </div>
                        <p className="text-[11px] text-slate-400">{(item.file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {item.result ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <Badge label="Loại" value={item.result.phan_loai_tai_lieu} />
                            {item.result.stt && <Badge label="STT" value={item.result.stt} color="blue" />}
                            {item.result.stt_bo_phan && <Badge label="Bộ phận" value={item.result.stt_bo_phan} color="blue" />}
                            <Badge label="SP" value={item.result.ten_san_pham} color="blue" />
                            {item.result.lan_ban_hanh && <Badge label="Lần" value={item.result.lan_ban_hanh} />}
                            {item.result.so_lo && <Badge label="Lô" value={item.result.so_lo} color="blue" />}
                            {item.result.mau_sac && <Badge label="Màu" value={item.result.mau_sac} color={item.result.mau_sac === 'hồng' ? 'rose' : 'gray'} />}
                          </div>
                          <p className={`text-[13px] font-mono px-2 py-1 rounded border break-all select-all transition-colors ${
                            item.downloaded 
                              ? 'bg-slate-50 border-slate-200 text-slate-500' 
                              : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                          }`}>
                            {item.result.ten_file_de_xuat}
                          </p>
                        </div>
                      ) : (
                        <div className="text-slate-400 text-sm italic">
                          {item.status === 'processing' ? 'Đang phân tích dữ liệu...' : item.error ? <span className="text-red-500">{item.error}</span> : 'Đang chờ xử lý...'}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <StatusIndicator status={item.status} downloaded={item.downloaded} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-2">
                        {item.status === 'completed' ? (
                          <button
                            onClick={() => downloadFile(item)}
                            className={`w-full py-2 px-3 rounded-lg flex items-center justify-center gap-2 font-bold text-xs transition-all ${
                              item.downloaded ? 'bg-slate-200 text-slate-500' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm active:scale-95'
                            }`}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            {item.downloaded ? 'Tải lại' : 'Tải về'}
                          </button>
                        ) : (
                          <>
                            <button
                              disabled={item.status === 'processing'}
                              onClick={() => processOneFile(item)}
                              className="w-full py-2 px-3 rounded-lg flex items-center justify-center gap-2 font-bold text-xs bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all border border-emerald-100 shadow-sm disabled:opacity-50"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                              Đổi tên ngay
                            </button>
                            
                            {item.file.type === 'application/pdf' && (
                              <button
                                disabled={item.status === 'processing'}
                                onClick={() => openSplitModal(item)}
                                className="w-full py-2 px-3 rounded-lg flex items-center justify-center gap-2 font-bold text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all border border-blue-100 shadow-sm disabled:opacity-50"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758L12 12m0 0l2.879 2.879M12 12l2.879-2.879" />
                                </svg>
                                Tách & Đổi tên
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Xem trước Kết quả
              </h3>
              <button 
                onClick={() => setPreviewItem(null)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                title="Đóng (Esc)"
              >
                <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 md:p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Image Side */}
                <div className="space-y-4">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ảnh văn bản gốc (Trang 1)</label>
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden shadow-inner flex items-center justify-center min-h-[400px]">
                    {previewItem.preview ? (
                      <img src={previewItem.preview} className="w-full h-auto object-contain" alt="Full Preview" />
                    ) : (
                      <div className="text-slate-400 italic">Không có ảnh xem trước</div>
                    )}
                  </div>
                </div>

                {/* Info Side */}
                <div className="space-y-6">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">Tên file đề xuất</label>
                    <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                      <p className="text-lg font-mono font-bold text-blue-700 break-all">
                        {previewItem.result?.ten_file_de_xuat || "Chưa có kết quả"}
                      </p>
                    </div>
                  </div>

                  {previewItem.result ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-end">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Chi tiết dữ liệu (Có thể sửa)</label>
                        <span className="text-[10px] text-blue-500 font-medium italic">Sửa nội dung sẽ tự cập nhật tên file</span>
                      </div>
                      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-50 shadow-sm">
                        <DataRow 
                          label="Phân loại" 
                          value={previewItem.result.phan_loai_tai_lieu} 
                          editable 
                          onChange={(val) => updateFileResult(previewItem.id, 'phan_loai_tai_lieu', val)}
                        />
                        <DataRow 
                          label="Tên sản phẩm" 
                          value={previewItem.result.ten_san_pham} 
                          editable 
                          onChange={(val) => updateFileResult(previewItem.id, 'ten_san_pham', val)}
                        />
                        {previewItem.result.phan_loai_tai_lieu === 'PKN' && (
                          <>
                            <DataRow 
                              label="Loại mẫu" 
                              value={previewItem.result.loai_mau || ""} 
                              editable 
                              onChange={(val) => updateFileResult(previewItem.id, 'loai_mau', val)}
                            />
                            <DataRow 
                              label="Màu sắc" 
                              value={previewItem.result.mau_sac || "trắng"} 
                              editable 
                              onChange={(val) => updateFileResult(previewItem.id, 'mau_sac', val)}
                            />
                          </>
                        )}
                        {previewItem.result.stt !== undefined && (
                          <DataRow 
                            label="STT (NL)" 
                            value={previewItem.result.stt} 
                            editable 
                            onChange={(val) => updateFileResult(previewItem.id, 'stt', val)}
                          />
                        )}
                        {previewItem.result.stt_bo_phan !== undefined && (
                          <DataRow 
                            label="STT Bộ phận" 
                            value={previewItem.result.stt_bo_phan} 
                            editable 
                            onChange={(val) => updateFileResult(previewItem.id, 'stt_bo_phan', val)}
                          />
                        )}
                        <DataRow 
                          label="Số lô" 
                          value={previewItem.result.so_lo} 
                          editable 
                          onChange={(val) => updateFileResult(previewItem.id, 'so_lo', val)}
                        />
                        <DataRow 
                          label="Lần ban hành" 
                          value={previewItem.result.lan_ban_hanh} 
                          editable 
                          onChange={(val) => updateFileResult(previewItem.id, 'lan_ban_hanh', val)}
                        />
                        <DataRow 
                          label="Ngày ban hành" 
                          value={previewItem.result.ngay_ban_hanh} 
                          editable 
                          onChange={(val) => updateFileResult(previewItem.id, 'ngay_ban_hanh', val)}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center p-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 italic">
                      <svg className="w-12 h-12 mb-2 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Tệp này chưa được xử lý OCR
                    </div>
                  )}

                  <div className="pt-4">
                    <button 
                      onClick={() => {
                        if (previewItem.status === 'completed') downloadFile(previewItem);
                        else processOneFile(previewItem);
                        setPreviewItem(null);
                      }}
                      className="w-full py-4 rounded-xl bg-blue-600 text-white font-bold shadow-lg hover:bg-blue-700 transition-all active:scale-95"
                    >
                      {previewItem.status === 'completed' ? 'Tải tệp này về máy' : 'Bắt đầu xử lý ngay'}
                    </button>
                    <p className="mt-4 text-[11px] text-slate-400 text-center leading-relaxed italic">
                      * Lưu ý: Kết quả trích xuất tự động bởi AI. Vui lòng đối chiếu kỹ với văn bản gốc bên trái trước khi tải xuống.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Split PDF Modal */}
      {splittingFile && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758L12 12m0 0l2.879 2.879M12 12l2.879-2.879" />
                </svg>
                Tách & Đổi tên tài liệu PDF
              </h3>
              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold text-slate-800 truncate max-w-[200px]">{splittingFile.file.name}</p>
                  <p className="text-[10px] text-slate-500 italic">Xem nội dung bên dưới để xác định trang cần tách</p>
                </div>
                <button 
                  onClick={() => setSplittingFile(null)}
                  className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="flex-1 flex overflow-hidden">
              {/* PDF Preview Frame - Custom Image Renderer to fix Chrome Block */}
              <div className="flex-1 bg-slate-200 p-4 relative overflow-y-auto custom-scrollbar">
                {isLoadingPages ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="font-bold animate-pulse">Đang tải toàn bộ nội dung tài liệu...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-6 pb-10">
                    {pdfPages.map((pageData, index) => (
                      <div key={index} className="relative shadow-2xl rounded-sm bg-white overflow-hidden border border-slate-300">
                        <img 
                          src={pageData} 
                          alt={`Trang ${index + 1}`} 
                          className="max-w-full h-auto block"
                          loading="lazy"
                        />
                        <div className="absolute top-0 left-0 bg-blue-600 text-white px-3 py-1 text-xs font-bold shadow-lg">
                          TRANG {index + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="sticky bottom-4 left-4 inline-block">
                  <span className="bg-slate-800/90 text-white text-[10px] px-3 py-1.5 rounded-lg backdrop-blur-sm font-bold uppercase tracking-widest shadow-xl border border-white/10">Trình xem file gốc (Đã sửa lỗi Chrome chặn)</span>
                </div>
              </div>

              {/* Controls Sidebar */}
              <div className="w-80 bg-white border-l border-slate-100 flex flex-col p-6 overflow-y-auto shrink-0 shadow-[-4px_0_15px_rgba(0,0,0,0.02)]">
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                      Danh sách tách:
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button 
                        onClick={splitEachPage}
                        className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded hover:bg-emerald-100 transition-colors flex items-center gap-1 shadow-sm border border-emerald-100"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                        </svg>
                        Mỗi trang 1 file
                      </button>
                      <button 
                        onClick={splitTwoPages}
                        className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded hover:bg-amber-100 transition-colors flex items-center gap-1 shadow-sm border border-amber-100"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                        </svg>
                        2 trang 1 file
                      </button>
                      <button 
                        onClick={addSplitRange}
                        className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition-colors flex items-center gap-1 shadow-sm border border-blue-100"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                        </svg>
                        Thêm file
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {splitRanges.map((range, index) => (
                      <div key={index} className="flex gap-2 group animate-in slide-in-from-right-2 duration-200">
                        <div className="relative flex-1">
                          <input 
                            type="text" 
                            autoFocus={index === splitRanges.length - 1}
                            placeholder={`Tệp ${index + 1}: vd 1-3`} 
                            value={range}
                            onChange={(e) => updateSplitRange(index, e.target.value)}
                            className="w-full pl-3 pr-2 py-2.5 rounded-xl border-2 border-slate-100 focus:border-blue-500 transition-all outline-none text-xs font-bold text-slate-700"
                          />
                          <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-blue-500 rounded-full flex items-center justify-center text-[6px] font-bold text-blue-600">
                            {index + 1}
                          </div>
                        </div>
                        <button 
                          onClick={() => removeSplitRange(index)}
                          className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 mb-6">
                  <p className="font-bold text-[10px] text-blue-800 mb-2 uppercase tracking-wider">Mẹo:</p>
                  <p className="text-[10px] text-blue-700 leading-relaxed italic">Cuộn xem trang bên trái, mỗi file bạn muốn tách hãy nhập một dải trang riêng.</p>
                </div>

                <div className="mt-auto space-y-3">
                  <button
                    disabled={splitRanges.every(r => r.trim() === '') || isSplitting}
                    onClick={() => handleSplitPdf(true)}
                    className="w-full py-4 font-bold text-white bg-blue-600 rounded-2xl hover:bg-blue-700 active:scale-95 transition-all shadow-xl shadow-blue-500/30 disabled:opacity-50 disabled:shadow-none flex flex-col items-center justify-center p-2"
                  >
                    {isSplitting ? (
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <span className="text-sm">Tách & Xử lý tất cả</span>
                        <span className="text-[10px] font-normal opacity-80">(Xử lý đồng thời {splitRanges.filter(r => r.trim() !== '').length} tệp)</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setSplittingFile(null)}
                    className="w-full py-3 font-bold text-slate-400 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all text-xs"
                  >
                    Hủy bỏ
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-12 py-8 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center text-slate-400 text-xs">
        <p>© 2024 GMP Header OCR - Hệ thống chuẩn hóa hồ sơ dược phẩm công nghiệp</p>
        <div className="flex items-center gap-4 mt-2 md:mt-0">
          <p className="italic">Nền tảng Gemini 3 Flash Vision</p>
          <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
          <p>Hỗ trợ đổi tên hàng loạt</p>
        </div>
      </footer>
    </div>
  );
};

const DataRow: React.FC<{ 
  label: string; 
  value: string; 
  editable?: boolean; 
  onChange?: (val: string) => void 
}> = ({ label, value, editable, onChange }) => (
  <div className="p-3 flex justify-between items-center hover:bg-slate-50 transition-colors text-slate-800">
    <span className="text-sm text-slate-500 font-medium whitespace-nowrap">{label}</span>
    {editable ? (
      <input 
        type="text" 
        value={value || ""} 
        onChange={(e) => onChange?.(e.target.value)}
        className="text-sm font-bold text-right ml-4 bg-blue-50/50 border border-blue-100 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
      />
    ) : (
      <span className="text-sm font-bold text-right ml-4">{value || "---"}</span>
    )}
  </div>
);

const Badge: React.FC<{ label: string; value: string; color?: 'gray' | 'blue' | 'rose' }> = ({ label, value, color = 'gray' }) => (
  <span className={`text-[10px] font-bold py-0.5 px-2 rounded-full border flex items-center gap-1 ${
    color === 'blue' ? 'bg-blue-50 text-blue-600 border-blue-100' : 
    color === 'rose' ? 'bg-rose-50 text-rose-600 border-rose-100' :
    'bg-slate-100 text-slate-600 border-slate-200'
  }`}>
    <span className="opacity-60">{label}:</span> {value}
  </span>
);

const StatusIndicator: React.FC<{ status: FileItem['status']; downloaded: boolean }> = ({ status, downloaded }) => {
  if (downloaded) {
    return <span className="text-emerald-500 text-xs font-bold flex items-center justify-center gap-1">
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
      Đã tải
    </span>;
  }

  switch (status) {
    case 'pending':
      return <span className="text-slate-400 text-xs font-bold flex items-center justify-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-300"></div> Chờ</span>;
    case 'processing':
      return <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>;
    case 'completed':
      return <span className="text-emerald-600 text-xs font-bold flex items-center justify-center gap-1"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>Sẵn sàng</span>;
    case 'error':
      return <span className="text-red-500 text-xs font-bold flex items-center justify-center gap-1"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>Lỗi</span>;
    default:
      return null;
  }
};

export default App;
