import React, { useState, useRef, useEffect } from 'react';
import { Move, Type, Trash2, Upload, MinusCircle, PlusCircle, AlignLeft, AlignCenter, AlignRight, Bold, Italic, AlertTriangle, Download, Copy, FileDown } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import html2canvas from 'html2canvas';
import Papa from 'papaparse';

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
  const [availablePlaceholders, setAvailablePlaceholders] = useState<string[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const textRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

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

  const replacePlaceholders = (text: string, data: BatchData) => {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => data[key] || match);
  };

  const exportToPDF = async (allPages = false) => {
    if (canvasRef.current && batchData.length > 0) {
      setIsExporting(true);
      const element = canvasRef.current;lTexts = [...texts];
      const opt = {
        margin: 0,
        filename: allPages ? 'all-pages.pdf' : 'batch-export.pdf',ollen
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { le eine temporäre Kopie des Canvas-Elements für den Export
          scale: 2,ontainer = document.createElement('div');
          width: 794,er.style.position = 'absolute';
          height: 370tempContainer.style.left = '-9999px';
        },tainer.style.width = '794px';
        jsPDF: { er.style.height = '370px';
          unit: 'cm',Child(tempContainer);
          format: [21.0, 9.8],
          orientation: 'landscape' // PDF-Optionen
        }  const opt = {
      };            margin: 0,
 filename: 'all-pages.pdf',
      try {y: 0.98 },
        const originalTexts = [...texts];
        const worker = html2pdf().set(opt);
        let first = true;              unit: 'cm',

        // If allPages is true, export all pages at once
        const pagesToExport = allPages ? batchData : [batchData[currentBatchIndex]];            }

        for (let i = 0; i < pagesToExport.length; i++) {
          const replacedTexts = texts.map(text => ({e ein PDF-Dokument
            ...text,
            text: replacePlaceholders(text.text, pagesToExport[i])ientation: 'landscape',
          }));
          setTexts(replacedTexts);  format: [21.0, 9.8]
          
          await new Promise(resolve => setTimeout(resolve, 100));
          age = true;
          if (first) {
            await worker.from(element).toPdf();e im Batch-Daten
            first = false; i = 0; i < batchData.length; i++) {
          } else {des aktuellen Canvas mit ersetzten Platzhalterwerten
            await worker.addPage();
            await worker.from(element).toPdf(); const clonedElement = element.cloneNode(true) as HTMLElement;
          }   tempContainer.appendChild(clonedElement);
        }            
latzhalter im geklonten Element
        await worker.save(); clonedElement.querySelectorAll('[data-text-id]');
        setTexts(originalTexts);s.forEach(textEl => {
      } catch (error) {id');
        console.error('Error exporting to PDF:', error);
        alert('Error exporting to PDF. Please try again.');(textObj) {
      } finally {ditableDiv = textEl.querySelector('[contenteditable]');
        setIsExporting(false);         if (contentEditableDiv) {
      }v.textContent = replacePlaceholders(textObj.text, batchData[i]);
    } else if (canvasRef.current) {
      setIsExporting(true);
      const element = canvasRef.current;
      const opt = {
            // Entferne Steuerelemente (Buttons etc.) im geklonten Element
            const controls = clonedElement.querySelectorAll('.move-handle, button');
            controls.forEach(control => control.remove());'jpeg', quality: 0.98 },
            : { 
            // Konvertiere die Seite in ein Bild und füge es zum PDF hinzu
            const canvas = await html2canvas(clonedElement, { 
              scale: 2,height: 370
              width: 794,
              height: 370,
              logging: false
            });
             orientation: 'landscape'
            const imgData = canvas.toDataURL('image/jpeg', 0.98);}
            };
            if (!isFirstPage) {
              pdf.addPage();
            }).set(opt).from(element).save();
            
            pdf.addImage(imgData, 'JPEG', 0, 0, 21.0, 9.8);
            isFirstPage = false;ror exporting to PDF. Please try again.');
          }
           setIsExporting(false);
          // Speichere das PDF }
          pdf.save('all-pages.pdf');}
            };
          // Bereinigen
          document.body.removeChild(tempContainer);
        } else {ve);
          // Exportiere nur die aktuelle SeitetListener('mouseup', handleMouseUp);
          const opt = {
            margin: 0,ve);
            filename: 'batch-export.pdf',window.removeEventListener('mouseup', handleMouseUp);
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {   }, [isDragging, selectedId, texts]);
              scale: 2,
              width: 794,  const selectedText = texts.find(text => text.id === selectedId);
              height: 370
            },
            jsPDF: { 100 p-8">
              unit: 'cm',
              format: [21.0, 9.8],
              orientation: 'landscape'6">
            }-bold">Text Editor</h1>
          };sName="flex gap-2">
          
          // Temporär die Texte mit ersetzten Platzhaltern aktualisieren
          const replacedTexts = texts.map(text => ({:bg-gray-100 rounded-lg"
            ...text, title="Export current page to PDF"
            text: replacePlaceholders(text.text, batchData[currentBatchIndex])
          }));ad size={20} />
          
          setTexts(replacedTexts);a.length > 0 && (
          
          // Warten, bis die Texte aktualisiert wurden
          await new Promise(resolve => setTimeout(resolve, 250));ver:bg-gray-100 rounded-lg"
          s to PDF"
          // Exportieren disabled={isExporting}
          await html2pdf().set(opt).from(element).save();
          wn size={20} />
          // Zurücksetzen auf die Originaltexte</button>
          setTexts(originalTexts);
        }v>
      } catch (error) {</div>
        console.error('Error exporting to PDF:', error);
        alert('Error exporting to PDF. Please try again.');gap-4 mb-6">
        setTexts(originalTexts);">
      } finally {ssName="flex-1">
        setIsExporting(false);
      }
    } else if (canvasRef.current) {
      setIsExporting(true);ext(e.target.value)}
      const element = canvasRef.current;
      const opt = {className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        margin: 0,
        filename: 'text-editor-export.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2, className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          width: 794,
          height: 370ze={20} />
        },t
        jsPDF: { 
          unit: 'cm', items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors cursor-pointer">
          format: [21.0, 9.8],e={20} />
          orientation: 'landscape' Font
        }
      };
      ff2"
      try {ntUpload}
        await html2pdf().set(opt).from(element).save();className="hidden"
      } catch (error) {
        console.error('Error exporting to PDF:', error);
        alert('Error exporting to PDF. Please try again.'); items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors cursor-pointer">
      } finally {ze={20} />
        setIsExporting(false); CSV
      }
    }
  };
VUpload}
  useEffect(() => {className="hidden"
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);bel>
    return () => {            </div>
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, selectedId, texts]);able placeholders:</span>
ePlaceholders.map((placeholder) => (
  const selectedText = texts.find(text => text.id === selectedId);

  return (
    <div className="min-h-screen bg-gray-100 p-8"> className="px-2 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6">older}
          <div className="flex justify-between items-center mb-6">/button>
            <h1 className="text-2xl font-bold">Text Editor</h1>
            <div className="flex gap-2"></div>
              <button            )}
                onClick={() => exportToPDF(false)}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" bg-gray-50 rounded-lg">
                title="Export current page to PDF"sName="flex items-center gap-2">
              >
                <Download size={20} />
              </button>max(8, fontSize - 2);
              {batchData.length > 0 && (
                <buttonif (selectedId) updateSelectedText({ fontSize: newSize });
                  onClick={() => exportToPDF(true)}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" className="p-1 hover:bg-gray-200 rounded"
                  title="Export all pages to PDF"
                  disabled={isExporting}ircle size={20} />
                >
                  <FileDown size={20} />lassName="w-12 text-center">{selectedText?.fontSize || fontSize}px</span>
                </button>
              )}
            </div>min(72, fontSize + 2);
          </div>
          if (selectedId) updateSelectedText({ fontSize: newSize });
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex gap-4"> className="p-1 hover:bg-gray-200 rounded"
              <div className="flex-1">
                <inputrcle size={20} />
                  type="text"tton>
                  value={newText}              </div>
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="Enter text"sName="flex items-center gap-2 border-l border-gray-300 pl-4">
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div> as const;
              <button
                onClick={handleAddText}if (selectedId) updateSelectedText({ align: newAlign });
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              > className={`p-1 rounded ${(selectedText?.align || textAlign) === 'left' ? 'bg-blue-100' : 'hover:bg-gray-200'}`}
                <Type size={20} />
                Add Texteft size={20} />
              </button>n>
              <label className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors cursor-pointer">
                <Upload size={20} />
                Upload Fontr' as const;
                <input
                  type="file"if (selectedId) updateSelectedText({ align: newAlign });
                  accept=".ttf,.otf,.woff,.woff2"
                  onChange={handleFontUpload} className={`p-1 rounded ${(selectedText?.align || textAlign) === 'center' ? 'bg-blue-100' : 'hover:bg-gray-200'}`}
                  className="hidden"
                />enter size={20} />
              </label>n>
              <label className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors cursor-pointer">
                <Upload size={20} />
                Upload CSV' as const;
                <input
                  type="file"if (selectedId) updateSelectedText({ align: newAlign });
                  accept=".csv"
                  onChange={handleCSVUpload} className={`p-1 rounded ${(selectedText?.align || textAlign) === 'right' ? 'bg-blue-100' : 'hover:bg-gray-200'}`}
                  className="hidden"
                />ight size={20} />
              </label>tton>
            </div>              </div>

            {availablePlaceholders.length > 0 && (sName="flex items-center gap-2 border-l border-gray-300 pl-4">
              <div className="flex flex-wrap gap-2 p-4 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">Available placeholders:</span>
                {availablePlaceholders.map((placeholder) => (Bold;
                  <button
                    key={placeholder}if (selectedId) updateSelectedText({ bold: newBold });
                    onClick={() => insertPlaceholder(placeholder)}
                    className="px-2 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200" className={`p-1 rounded ${(selectedText?.bold || isBold) ? 'bg-blue-100' : 'hover:bg-gray-200'}`}
                  >
                    {placeholder}ize={20} />
                  </button>n>
                ))}
              </div>
            )}alic;

            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">if (selectedId) updateSelectedText({ italic: newItalic });
              <div className="flex items-center gap-2">
                <button className={`p-1 rounded ${(selectedText?.italic || isItalic) ? 'bg-blue-100' : 'hover:bg-gray-200'}`}
                  onClick={() => {
                    const newSize = Math.max(8, fontSize - 2); size={20} />
                    setFontSize(newSize);tton>
                    if (selectedId) updateSelectedText({ fontSize: newSize });              </div>
                  }}
                  className="p-1 hover:bg-gray-200 rounded"300 pl-4">
                >className="text-sm text-gray-600">Line Height:</span>
                  <MinusCircle size={20} />
                </button>ange"
                <span className="w-12 text-center">{selectedText?.fontSize || fontSize}px</span>
                <button
                  onClick={() => {
                    const newSize = Math.min(72, fontSize + 2);t?.lineHeight || lineHeight}
                    setFontSize(newSize);
                    if (selectedId) updateSelectedText({ fontSize: newSize });oat(e.target.value);
                  }}
                  className="p-1 hover:bg-gray-200 rounded"if (selectedId) updateSelectedText({ lineHeight: newLineHeight });
                >
                  <PlusCircle size={20} />className="w-24"
                </button>
              </div>n className="text-sm w-12">{(selectedText?.lineHeight || lineHeight).toFixed(1)}</span>
              </div>
              <div className="flex items-center gap-2 border-l border-gray-300 pl-4">
                <buttonray-300 pl-4">
                  onClick={() => {className="text-sm text-gray-600">Padding:</span>
                    const newAlign = 'left' as const;
                    setTextAlign(newAlign);ange"
                    if (selectedId) updateSelectedText({ align: newAlign });
                  }}
                  className={`p-1 rounded ${(selectedText?.align || textAlign) === 'left' ? 'bg-blue-100' : 'hover:bg-gray-200'}`}
                >t?.padding || padding}
                  <AlignLeft size={20} />
                </button>eInt(e.target.value);
                <button
                  onClick={() => {if (selectedId) updateSelectedText({ padding: newPadding });
                    const newAlign = 'center' as const;
                    setTextAlign(newAlign);className="w-24"
                    if (selectedId) updateSelectedText({ align: newAlign });
                  }}n className="text-sm w-12">{selectedText?.padding || padding}px</span>
                  className={`p-1 rounded ${(selectedText?.align || textAlign) === 'center' ? 'bg-blue-100' : 'hover:bg-gray-200'}`}v>
                >v>
                  <AlignCenter size={20} />          </div>
                </button>
                <button
                  onClick={() => {
                    const newAlign = 'right' as const;e="relative w-full h-[370px] border-2 border-gray-200 rounded-lg bg-white overflow-hidden"
                    setTextAlign(newAlign);
                    if (selectedId) updateSelectedText({ align: newAlign });
                  }}height: '370px'
                  className={`p-1 rounded ${(selectedText?.align || textAlign) === 'right' ? 'bg-blue-100' : 'hover:bg-gray-200'}`} }}
                >
                  <AlignRight size={20} />.map((text) => (
                </button>
              </div>

              <div className="flex items-center gap-2 border-l border-gray-300 pl-4">
                <buttonelectedId === text.id ? 'text-blue-600' : 'text-gray-800'
                  onClick={() => {
                    const newBold = !isBold;
                    setIsBold(newBold);,
                    if (selectedId) updateSelectedText({ bold: newBold });,
                  }}minWidth: '100px',
                  className={`p-1 rounded ${(selectedText?.bold || isBold) ? 'bg-blue-100' : 'hover:bg-gray-200'}`}
                > e)}
                  <Bold size={20} /> ref={(el) => textRefs.current[text.id] = el}
                </button>
                <button
                  onClick={() => {
                    const newItalic = !isItalic;ize={14} className="opacity-50 cursor-move move-handle" />
                    setIsItalic(newItalic);
                    if (selectedId) updateSelectedText({ italic: newItalic });
                  }}y-0 group-hover:opacity-100 text-gray-500 transition-opacity"
                  className={`p-1 rounded ${(selectedText?.italic || isItalic) ? 'bg-blue-100' : 'hover:bg-gray-200'}`} title="Duplicate"
                >
                  <Italic size={20} />ize={14} />
                </button>n>
              </div>

              <div className="flex items-center gap-2 border-l border-gray-300 pl-4"> className="opacity-0 group-hover:opacity-100 text-red-500 transition-opacity"
                <span className="text-sm text-gray-600">Line Height:</span>
                <input size={14} />
                  type="range"
                  min="1"
                  max="3"<AlertTriangle size={14} className="text-amber-500" title="Text is overflowing the canvas" />
                  step="0.1"
                  value={selectedText?.lineHeight || lineHeight}</div>
                  onChange={(e) => {
                    const newLineHeight = parseFloat(e.target.value);
                    setLineHeight(newLineHeight);
                    if (selectedId) updateSelectedText({ lineHeight: newLineHeight });
                  }}tChange(text.id, e)}
                  className="w-24"
                />e="outline-none whitespace-pre-wrap break-words"
                <span className="text-sm w-12">{(selectedText?.lineHeight || lineHeight).toFixed(1)}</span>
              </div>em-ui',
Size}px`,
              <div className="flex items-center gap-2 border-l border-gray-300 pl-4">
                <span className="text-sm text-gray-600">Padding:</span>
                <inputalic' : 'normal',
                  type="range"
                  min="0"padding: `0 ${text.padding}px`,
                  max="50" }}
                  step="2"
                  value={selectedText?.padding || padding}
                  onChange={(e) => {ceholders(text.text, batchData[currentBatchIndex])
                    const newPadding = parseInt(e.target.value);text.text}
                    setPadding(newPadding);v>
                    if (selectedId) updateSelectedText({ padding: newPadding });/div>
                  }}
                  className="w-24"          </div>
                />
                <span className="text-sm w-12">{selectedText?.padding || padding}px</span>
              </div>sName="flex items-center justify-between mt-4 p-4 bg-gray-50 rounded-lg">
            </div>
          </div>x(Math.max(0, currentBatchIndex - 1))}

          <div className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
            ref={canvasRef}
            className="relative w-full h-[370px] border-2 border-gray-200 rounded-lg bg-white overflow-hidden"s
            style={{
              width: '794px',
              height: '370px'ew {currentBatchIndex + 1} of {batchData.length}
            }}
          >
            {texts.map((text) => (a.length - 1, currentBatchIndex + 1))}
              <div
                key={text.id} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
                data-text-id={text.id}
                className={`absolute group ${
                  selectedId === text.id ? 'text-blue-600' : 'text-gray-800'tton>
                }`}</div>
                style={{
                  left: `${text.x}px`,v>
                  top: `${text.y}px`,v>
                  minWidth: '100px',</div>
                }} );
                onMouseDown={(e) => handleMouseDown(text.id, e)}}
                ref={(el) => textRefs.current[text.id] = el}










































































export default App;}  );    </div>      </div>        </div>          )}            </div>              </button>                Next              >                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"                disabled={currentBatchIndex === batchData.length - 1}                onClick={() => setCurrentBatchIndex(Math.min(batchData.length - 1, currentBatchIndex + 1))}              <button              </span>                Preview {currentBatchIndex + 1} of {batchData.length}              <span className="text-sm text-gray-600">              </button>                Previous              >                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"                disabled={currentBatchIndex === 0}                onClick={() => setCurrentBatchIndex(Math.max(0, currentBatchIndex - 1))}              <button            <div className="flex items-center justify-between mt-4 p-4 bg-gray-50 rounded-lg">          {batchData.length > 0 && (          </div>            ))}              </div>                </div>                    : text.text}                    ? replacePlaceholders(text.text, batchData[currentBatchIndex])                  {batchData.length > 0 && currentBatchIndex < batchData.length                >                  }}                    padding: `0 ${text.padding}px`,                    lineHeight: text.lineHeight,                    fontStyle: text.italic ? 'italic' : 'normal',                    fontWeight: text.bold ? 'bold' : 'normal',                    textAlign: text.align,                    fontSize: `${text.fontSize}px`,                    fontFamily: customFont || 'system-ui',                  style={{                  className="outline-none whitespace-pre-wrap break-words"                  onKeyDown={handleKeyDown}                  onInput={(e) => handleTextChange(text.id, e)}                  suppressContentEditableWarning                  contentEditable                <div                )}                  </div>                    )}                      <AlertTriangle size={14} className="text-amber-500" title="Text is overflowing the canvas" />                    {text.isOverflowing && (                    </button>                      <Trash2 size={14} />                    >                      className="opacity-0 group-hover:opacity-100 text-red-500 transition-opacity"                      onClick={() => deleteText(text.id)}                    <button                    </button>                      <Copy size={14} />                    >                      title="Duplicate"                      className="opacity-0 group-hover:opacity-100 text-gray-500 transition-opacity"                      onClick={() => duplicateText(text.id)}                    <button                    <Move size={14} className="opacity-50 cursor-move move-handle" />                  <div className="flex items-center gap-1 mb-1">                {!isExporting && (              >export default App;