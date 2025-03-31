import React, { useState, useRef, useEffect } from 'react';
import { Move, Type, Trash2, Upload, MinusCircle, PlusCircle, AlignLeft, AlignCenter, AlignRight, Bold, Italic, AlertTriangle, Download, Copy, FileDown } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import html2canvas from 'html2canvas';
import Papa from 'papaparse';
import { jsPDF } from 'jspdf'; // Import jsPDF properly

interface TextElement {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  align: 'left' | 'center' | 'right';
  bold: boolean;
  italic: boolean;
  lineHeight: number;
  padding: number;
  isOverflowing?: boolean;
}

interface BatchData {
  [key: string]: string;
}

function App() {
  const [texts, setTexts] = useState<TextElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [newText, setNewText] = useState('');
  const [customFont, setCustomFont] = useState<string>('LiebeHeide');
  const [fontSize, setFontSize] = useState(16);
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left');
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [lineHeight, setLineHeight] = useState(1.5);
  const [padding, setPadding] = useState(0);
  const [batchData, setBatchData] = useState<BatchData[]>([]);
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false); // Add this new state variable
  const [availablePlaceholders, setAvailablePlaceholders] = useState<string[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const textRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const [canvasWidth, setCanvasWidth] = useState(794);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartXRef = useRef<number | null>(null);

  // Add a state for storing the font data
  const [fontData, setFontData] = useState<{ data: string, name: string } | null>(null);

  const handleFontUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const result = e.target?.result;
          if (typeof result === 'string') {
            const fontFace = new FontFace('CustomFont', `url(${result})`);
            const loadedFont = await fontFace.load();
            (document.fonts as FontFaceSet).add(loadedFont);
            
            // Store the font data for PDF export
            setFontData({
              data: result,
              name: 'CustomFont'
            });
            
            setCustomFont('CustomFont');
          }
        } catch (error) {
          console.error('Error loading font:', error);
          alert('Error loading font. Please try a different font file.');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        complete: (results) => {
          const data = results.data as BatchData[];
          if (data.length > 0) {
            setBatchData(data);
            setCurrentBatchIndex(0);
            // Extract column headers as available placeholders
            const headers = Object.keys(data[0]);
            setAvailablePlaceholders(headers);
          }
        },
        error: (error) => {
          console.error('Error parsing CSV:', error);
          alert('Error parsing CSV file. Please check the format and try again.');
        }
      });
    }
  };

  const insertPlaceholder = (placeholder: string) => {
    if (selectedId) {
      const selectedText = texts.find(t => t.id === selectedId);
      if (selectedText) {
        const cursorPosition = window.getSelection()?.getRangeAt(0);
        if (cursorPosition) {
          const beforeCursor = selectedText.text.slice(0, cursorPosition.startOffset);
          const afterCursor = selectedText.text.slice(cursorPosition.endOffset);
          const newText = `${beforeCursor}{{${placeholder}}}${afterCursor}`;
          
          const newTexts = texts.map(text =>
            text.id === selectedId
              ? { ...text, text: newText }
              : text
          );
          setTexts(newTexts);
        }
      }
    } else {
      const newElement: TextElement = {
        id: Date.now().toString(),
        text: `{{${placeholder}}}`,
        x: 50,
        y: 50,
        fontSize,
        align: textAlign,
        bold: isBold,
        italic: isItalic,
        lineHeight,
        padding,
      };
      const newTexts = [...texts, newElement];
      setTexts(newTexts);
      setSelectedId(newElement.id);
    }
  };

  const handleAddText = () => {
    if (newText.trim()) {
      const newElement: TextElement = {
        id: Date.now().toString(),
        text: newText.trim(),
        x: 50,
        y: 50,
        fontSize,
        align: textAlign,
        bold: isBold,
        italic: isItalic,
        lineHeight,
        padding,
      };
      const newTexts = [...texts, newElement];
      setTexts(newTexts);
      setNewText('');
    }
  };

  const handleMouseDown = (id: string, e: React.MouseEvent) => {
    if (e.button === 0) {
      const target = e.target as HTMLElement;
      if (target.closest('.move-handle') || !target.closest('[contenteditable]')) {
        setSelectedId(id);
        setIsDragging(true);
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        dragStartPosRef.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
      } else {
        setSelectedId(id);
      }
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging && selectedId && canvasRef.current && dragStartPosRef.current) {
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - canvasRect.left - dragStartPosRef.current.x;
      const y = e.clientY - canvasRect.top - dragStartPosRef.current.y;

      setTexts(texts.map(text => 
        text.id === selectedId
          ? { ...text, x: Math.max(0, Math.min(x, canvasRect.width - 100)), y: Math.max(0, Math.min(y, canvasRect.height - 30)) }
          : text
      ));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStartPosRef.current = null;
  };

  const handleTextChange = (id: string, e: React.FormEvent<HTMLDivElement>) => {
    const newText = e.currentTarget.innerText;
    const newTexts = texts.map(text =>
      text.id === id
        ? { ...text, text: newText }
        : text
    );
    setTexts(newTexts);
  };

  // Add key handler for Escape key to cancel editing
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const selection = window.getSelection();
      const range = selection?.getRangeAt(0);
      if (range) {
        const br = document.createElement('br');
        range.deleteContents();
        range.insertNode(br);
        range.setStartAfter(br);
        range.setEndAfter(br);
        selection?.removeAllRanges();
        selection?.addRange(range);
        
        const textElement = e.currentTarget;
        const id = textElement.closest('[data-text-id]')?.getAttribute('data-text-id');
        if (id) {
          const newTexts = texts.map(text =>
            text.id === id
              ? { ...text, text: textElement.innerText }
              : text
          );
          setTexts(newTexts);
        }
      }
    } else if (e.key === 'Escape') {
      // Lose focus on Escape
      (e.target as HTMLElement).blur();
      e.preventDefault();
    }
  };

  const deleteText = (id: string) => {
    const newTexts = texts.filter(text => text.id !== id);
    setTexts(newTexts);
    setSelectedId(null);
  };

  const updateSelectedText = (updates: Partial<TextElement>) => {
    if (selectedId) {
      const newTexts = texts.map(text =>
        text.id === selectedId
          ? { ...text, ...updates }
          : text
      );
      setTexts(newTexts);
    }
  };

  const duplicateText = (id: string) => {
    const textToDuplicate = texts.find(text => text.id === id);
    if (textToDuplicate) {
      const newText: TextElement = {
        ...textToDuplicate,
        id: Date.now().toString(),
        x: textToDuplicate.x + 20,
        y: textToDuplicate.y + 20
      };
      const newTexts = [...texts, newText];
      setTexts(newTexts);
      setSelectedId(newText.id);
    }
  };

  // Improved placeholder replacement with better error handling
  const replacePlaceholders = (text: string, data: BatchData) => {
    if (!data) return text;
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] !== undefined ? data[key] : `[${key}]`;
    });
  };

  // Enhanced text overflow check with debouncing
  const checkTextOverflow = () => {
    if (!canvasRef.current) return;
    
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const canvasWidth = canvasRect.width;
    const canvasHeight = canvasRect.height;
    
    const updatedTexts = texts.map(text => {
      const textElement = textRefs.current[text.id];
      if (!textElement) return text;
      
      const textRect = textElement.getBoundingClientRect();
      const isOverflowing = 
        text.x + textRect.width > canvasWidth || 
        text.y + textRect.height > canvasHeight;
      
      return isOverflowing !== text.isOverflowing ? { ...text, isOverflowing } : text;
    });
    
    // Only update if there are actual changes to avoid re-renders
    if (JSON.stringify(updatedTexts) !== JSON.stringify(texts)) {
      setTexts(updatedTexts);
    }
  };

  // Add a function to clear all text elements
  const clearAllTexts = () => {
    if (window.confirm('Are you sure you want to remove all text elements?')) {
      setTexts([]);
      setSelectedId(null);
    }
  };

  // Updated exportToPDF function to use custom fonts
  const exportToPDF = async (allPages = false) => {
    if (!canvasRef.current) {
      alert('Canvas reference is not available. Please try again.');
      return;
    }
    
    setIsExporting(true);
    const element = canvasRef.current;
    const originalTexts = [...texts];
    
    try {
      // Since we can't easily use the custom font in vector format,
      // we'll use image-based export for the best visual fidelity
      
      // Configure PDF options
      const opt = {
        margin: 0,
        filename: allPages ? 'all-pages.pdf' : 'text-editor-export.pdf',
        image: { type: 'jpeg', quality: 1.0 },
        html2canvas: { 
          scale: 4, // Higher scale for better quality
          width: 794,
          height: 370,
          backgroundColor: '#ffffff',
          logging: false,
          useCORS: true,
          imageTimeout: 5000 // Longer timeout to ensure font rendering
        },
        jsPDF: { 
          unit: 'mm',
          format: [210, 98],
          orientation: 'landscape',
          compress: false
        }
      };
      
      // Hide controls during capture
      setIsCapturing(true);
      
      // For batch processing of multiple pages
      if (allPages && batchData.length > 0) {
        // Create a PDF document
        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'mm',
          format: [210, 98]
        });
        
        let isFirstPage = true;
        
        for (let i = 0; i < batchData.length; i++) {
          // Update text with current batch data
          const replacedTexts = texts.map(text => ({
            ...text,
            text: replacePlaceholders(text.text, batchData[i])
          }));
          
          setTexts(replacedTexts);
          
          // Allow DOM to update
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Capture the current state as a high-resolution image
          const canvas = await html2canvas(element, {
            scale: 4,
            width: 794,
            height: 370,
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true
          });
          
          // Get image data
          const imgData = canvas.toDataURL('image/jpeg', 1.0);
          
          // Add new page for all pages except the first
          if (!isFirstPage) {
            pdf.addPage();
          }
          
          // Add the image to the PDF
          pdf.addImage(imgData, 'JPEG', 0, 0, 210, 98);
          isFirstPage = false;
          
          // Log progress
          console.log(`Processed page ${i+1} of ${batchData.length}`);
        }
        
        // Save the PDF
        pdf.save('all-pages.pdf');
      } 
      // For exporting single page
      else {
        if (batchData.length > 0) {
          // Replace placeholders with data from current batch
          const replacedTexts = texts.map(text => ({
            ...text,
            text: replacePlaceholders(text.text, batchData[currentBatchIndex])
          }));
          
          setTexts(replacedTexts);
          
          // Allow DOM to update
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        // Export current page
        await html2pdf().set(opt).from(element).save();
      }
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      alert(`Error exporting to PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      // Reset to original state
      setTexts(originalTexts);
      setIsExporting(false);
      setIsCapturing(false);
    }
  };

  // Fix dependency array in useEffect
  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    if (isResizing) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [isDragging, selectedId, isResizing]); // Remove texts from dependency array as it causes frequent re-renders

  // Use a debounced effect for checking text overflow
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      checkTextOverflow();
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [texts, batchData, currentBatchIndex]);

  const selectedText = texts.find(text => text.id === selectedId);

  // Neue Funktionen für das Resize-Feature
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartXRef.current = e.clientX;
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (isResizing && resizeStartXRef.current !== null) {
      const diff = e.clientX - resizeStartXRef.current;
      const newWidth = Math.max(400, Math.min(1200, canvasWidth + diff));
      setCanvasWidth(newWidth);
      resizeStartXRef.current = e.clientX;
    }
  };

  const handleResizeEnd = () => {
    setIsResizing(false);
    resizeStartXRef.current = null;
    // Überprüfen, ob Elemente außerhalb des sichtbaren Bereichs sind
    checkTextOverflow();
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Text Editor</h1>
            <div className="flex gap-2">
              <button
                onClick={() => exportToPDF(false)}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                title="Export current page to PDF"
                disabled={isExporting}
              >
                <Download size={20} />
              </button>
              {batchData.length > 0 && (
                <button
                  onClick={() => exportToPDF(true)}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  title="Export all pages to PDF"
                  disabled={isExporting}
                >
                  <FileDown size={20} />
                </button>
              )}
              <button
                onClick={clearAllTexts}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                title="Clear all text elements"
              >
                <Trash2 size={20} />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4 mb-6">
            <div className="flex gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="Enter text"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={handleAddText}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                <Type size={20} />
                Add Text
              </button>
              <label className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors cursor-pointer">
                <Upload size={20} />
                Upload Font
                <input
                  type="file"
                  accept=".ttf,.otf,.woff,.woff2"
                  onChange={handleFontUpload}
                  className="hidden"
                />
              </label>
              <label className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors cursor-pointer">
                <Upload size={20} />
                Upload CSV
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCSVUpload}
                  className="hidden"
                />
              </label>
            </div>

            {availablePlaceholders.length > 0 && (
              <div className="flex flex-wrap gap-2 p-4 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">Available placeholders:</span>
                {availablePlaceholders.map((placeholder) => (
                  <button
                    key={placeholder}
                    onClick={() => insertPlaceholder(placeholder)}
                    className="px-2 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    {placeholder}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const newSize = Math.max(8, fontSize - 2);
                    setFontSize(newSize);
                    if (selectedId) updateSelectedText({ fontSize: newSize });
                  }}
                  className="p-1 hover:bg-gray-200 rounded"
                >
                  <MinusCircle size={20} />
                </button>
                <span className="w-12 text-center">{selectedText?.fontSize || fontSize}px</span>
                <button
                  onClick={() => {
                    const newSize = Math.min(72, fontSize + 2);
                    setFontSize(newSize);
                    if (selectedId) updateSelectedText({ fontSize: newSize });
                  }}
                  className="p-1 hover:bg-gray-200 rounded"
                >
                  <PlusCircle size={20} />
                </button>
              </div>
              <div className="flex items-center gap-2 border-l border-gray-300 pl-4">
                <button
                  onClick={() => {
                    const newAlign = 'left' as const;
                    setTextAlign(newAlign);
                    if (selectedId) updateSelectedText({ align: newAlign });
                  }}
                  className={`p-1 rounded ${(selectedText?.align || textAlign) === 'left' ? 'bg-blue-100' : 'hover:bg-gray-200'}`}
                >
                  <AlignLeft size={20} />
                </button>
                <button
                  onClick={() => {
                    const newAlign = 'center' as const;
                    setTextAlign(newAlign);
                    if (selectedId) updateSelectedText({ align: newAlign });
                  }}
                  className={`p-1 rounded ${(selectedText?.align || textAlign) === 'center' ? 'bg-blue-100' : 'hover:bg-gray-200'}`}
                >
                  <AlignCenter size={20} />
                </button>
                <button
                  onClick={() => {
                    const newAlign = 'right' as const;
                    setTextAlign(newAlign);
                    if (selectedId) updateSelectedText({ align: newAlign });
                  }}
                  className={`p-1 rounded ${(selectedText?.align || textAlign) === 'right' ? 'bg-blue-100' : 'hover:bg-gray-200'}`}
                >
                  <AlignRight size={20} />
                </button>
              </div>

              <div className="flex items-center gap-2 border-l border-gray-300 pl-4">
                <button
                  onClick={() => {
                    const newBold = !isBold;
                    setIsBold(newBold);
                    if (selectedId) updateSelectedText({ bold: newBold });
                  }}
                  className={`p-1 rounded ${(selectedText?.bold || isBold) ? 'bg-blue-100' : 'hover:bg-gray-200'}`}
                >
                  <Bold size={20} />
                </button>
                <button
                  onClick={() => {
                    const newItalic = !isItalic;
                    setIsItalic(newItalic);
                    if (selectedId) updateSelectedText({ italic: newItalic });
                  }}
                  className={`p-1 rounded ${(selectedText?.italic || isItalic) ? 'bg-blue-100' : 'hover:bg-gray-200'}`}
                >
                  <Italic size={20} />
                </button>
              </div>

              <div className="flex items-center gap-2 border-l border-gray-300 pl-4">
                <span className="text-sm text-gray-600">Line Height:</span>
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.1"
                  value={selectedText?.lineHeight || lineHeight}
                  onChange={(e) => {
                    const newLineHeight = parseFloat(e.target.value);
                    setLineHeight(newLineHeight);
                    if (selectedId) updateSelectedText({ lineHeight: newLineHeight });
                  }}
                  className="w-24"
                />
                <span className="text-sm w-12">{(selectedText?.lineHeight || lineHeight).toFixed(1)}</span>
              </div>
              <div className="flex items-center gap-2 border-l border-gray-300 pl-4">
                <span className="text-sm text-gray-600">Padding:</span>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="2"
                  value={selectedText?.padding || padding}
                  onChange={(e) => {
                    const newPadding = parseInt(e.target.value);
                    setPadding(newPadding);
                    if (selectedId) updateSelectedText({ padding: newPadding });
                  }}
                  className="w-24"
                />
                <span className="text-sm w-12">{selectedText?.padding || padding}px</span>
              </div>
            </div>
          </div>

          <div className="mb-2 flex items-center">
            <span className="text-sm text-gray-600 mr-2">Textfenster-Breite:</span>
            <span className="text-sm font-medium">{canvasWidth}px</span>
          </div>

          <div className="relative">
            <div
              ref={canvasRef}
              className="relative border-2 border-gray-200 rounded-lg bg-white overflow-hidden"
              style={{
                width: `${canvasWidth}px`,
                height: '370px'
              }}
            >
              {texts.map((text) => (
                <div
                  key={text.id}
                  data-text-id={text.id}
                  className={`absolute group ${
                    selectedId === text.id ? 'text-blue-600 ring-2 ring-blue-200 rounded' : 'text-gray-800'
                  } ${isDragging && selectedId === text.id ? 'cursor-grabbing opacity-80' : ''}`}
                  style={{
                    left: `${text.x}px`,
                    top: `${text.y}px`,
                    minWidth: '100px',
                    maxWidth: '600px', // Prevent text from extending too far
                    fontSize: `${text.fontSize}px`,
                    fontFamily: customFont || 'system-ui',
                    textAlign: text.align,
                    fontWeight: text.bold ? 'bold' : 'normal',
                    fontStyle: text.italic ? 'italic' : 'normal',
                    lineHeight: text.lineHeight,
                    padding: `0 ${text.padding}px`,
                  }}
                  onMouseDown={(e) => handleMouseDown(text.id, e)}
                  ref={(el) => textRefs.current[text.id] = el}
                >
                  {!isExporting && (
                    <div className="flex items-center gap-1 mb-1">
                      <Move size={14} className="opacity-50 cursor-move move-handle" />
                      <button
                        onClick={() => duplicateText(text.id)}
                        title="Duplicate"
                        className="opacity-0 group-hover:opacity-100 text-gray-500 transition-opacity"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={() => deleteText(text.id)}
                        className="opacity-0 group-hover:opacity-100 text-red-500 transition-opacity"
                      >
                        <Trash2 size={14} />
                      </button>
                      {text.isOverflowing && (
                        <AlertTriangle 
                          size={14} 
                          className="text-amber-500" 
                          title="Text is overflowing the canvas boundaries"
                        />
                      )}
                    </div>
                  )}
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    onInput={(e) => handleTextChange(text.id, e)}
                    onKeyDown={handleKeyDown}
                    className="outline-none whitespace-pre-wrap break-words"
                  >
                    {batchData.length > 0 && currentBatchIndex < batchData.length
                      ? replacePlaceholders(text.text, batchData[currentBatchIndex])
                      : text.text}
                  </div>
                </div>
              ))}
              {isExporting && !isCapturing && (
                <div className="absolute inset-0 bg-white bg-opacity-50 flex items-center justify-center">
                  <div className="text-lg font-semibold text-gray-700">Generating PDF...</div>
                </div>
              )}
            </div>
            
            {/* Resize-Handle hinzufügen */}
            <div 
              className="absolute top-0 right-0 bottom-0 w-4 cursor-ew-resize hover:bg-blue-200 opacity-50 hover:opacity-100 transition-opacity"
              onMouseDown={handleResizeStart}
              style={{
                touchAction: 'none'
              }}
            >
              <div className="h-full flex items-center justify-center">
                <div className="h-8 w-1 bg-gray-400 rounded"></div>
              </div>
            </div>
            
            {/* Breite-Anzeiger am unteren Rand */}
            <div className="absolute bottom-[-20px] left-0 right-0 text-xs text-gray-500 text-center">
              {isResizing ? `${canvasWidth}px` : ''}
            </div>
          </div>

          {batchData.length > 0 && (
            <div className="flex items-center justify-between mt-4 p-4 bg-gray-50 rounded-lg">
              <button
                disabled={currentBatchIndex === 0}
                onClick={() => setCurrentBatchIndex(Math.max(0, currentBatchIndex - 1))}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Preview {currentBatchIndex + 1} of {batchData.length}
              </span>
              <button
                disabled={currentBatchIndex === batchData.length - 1}
                onClick={() => setCurrentBatchIndex(Math.min(batchData.length - 1, currentBatchIndex + 1))}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;