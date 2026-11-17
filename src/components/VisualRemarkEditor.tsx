import React, { useRef, useEffect, useState, useCallback } from "react";
import { Highlighter, Bold, Eraser, Sparkles, Code2, Eye, Info } from "lucide-react";
import { HighlightColor, HIGHLIGHT_OPTIONS, getHighlightMarkClasses } from "./RemarkHighlightRenderer";

/**
 * Convert backend markup tags ([green]...[/green], **bold**, etc.) to visual HTML elements for WYSIWYG editing
 */
export function tagsToHtml(rawText: string, theme: "light" | "dark" | "navy" = "light"): string {
  if (!rawText) return "";

  // 1. Clean up duplicate or nested tags
  let text = rawText.replace(
    /\[(yellow|green|blue|orange|pink|red|purple)\]\s*\[(yellow|green|blue|orange|pink|red|purple)\]([\s\S]*?)\[\/\2\]\s*\[\/\1\]/gi,
    "[$1]$3[/$1]"
  );

  const basePillClass = "inline-block font-bold px-1.5 py-0.5 mx-0.5 rounded-md border shadow-2xs align-baseline cursor-pointer";

  // Replace highlight tags with <mark data-color="..."> tags
  let html = text
    // Yellow
    .replace(
      /\[yellow\]([\s\S]*?)\[\/yellow\]/gi,
      (_, inner) => `<mark data-color="yellow" class="${basePillClass} ${getHighlightMarkClasses("yellow", theme)}">${inner}</mark>`
    )
    .replace(
      /\[hl:yellow\]([\s\S]*?)\[\/hl\]/gi,
      (_, inner) => `<mark data-color="yellow" class="${basePillClass} ${getHighlightMarkClasses("yellow", theme)}">${inner}</mark>`
    )
    .replace(
      /==([\s\S]*?)==/g,
      (_, inner) => `<mark data-color="yellow" class="${basePillClass} ${getHighlightMarkClasses("yellow", theme)}">${inner}</mark>`
    )
    // Green
    .replace(
      /\[green\]([\s\S]*?)\[\/green\]/gi,
      (_, inner) => `<mark data-color="green" class="${basePillClass} ${getHighlightMarkClasses("green", theme)}">${inner}</mark>`
    )
    .replace(
      /\[hl:green\]([\s\S]*?)\[\/hl\]/gi,
      (_, inner) => `<mark data-color="green" class="${basePillClass} ${getHighlightMarkClasses("green", theme)}">${inner}</mark>`
    )
    // Blue
    .replace(
      /\[blue\]([\s\S]*?)\[\/blue\]/gi,
      (_, inner) => `<mark data-color="blue" class="${basePillClass} ${getHighlightMarkClasses("blue", theme)}">${inner}</mark>`
    )
    .replace(
      /\[hl:blue\]([\s\S]*?)\[\/hl\]/gi,
      (_, inner) => `<mark data-color="blue" class="${basePillClass} ${getHighlightMarkClasses("blue", theme)}">${inner}</mark>`
    )
    // Orange
    .replace(
      /\[orange\]([\s\S]*?)\[\/orange\]/gi,
      (_, inner) => `<mark data-color="orange" class="${basePillClass} ${getHighlightMarkClasses("orange", theme)}">${inner}</mark>`
    )
    .replace(
      /\[hl:orange\]([\s\S]*?)\[\/hl\]/gi,
      (_, inner) => `<mark data-color="orange" class="${basePillClass} ${getHighlightMarkClasses("orange", theme)}">${inner}</mark>`
    )
    // Pink / Red
    .replace(
      /\[(?:pink|red)\]([\s\S]*?)\[\/(?:pink|red)\]/gi,
      (_, inner) => `<mark data-color="pink" class="${basePillClass} ${getHighlightMarkClasses("pink", theme)}">${inner}</mark>`
    )
    .replace(
      /\[hl:(?:pink|red)\]([\s\S]*?)\[\/hl\]/gi,
      (_, inner) => `<mark data-color="pink" class="${basePillClass} ${getHighlightMarkClasses("pink", theme)}">${inner}</mark>`
    )
    // Purple
    .replace(
      /\[purple\]([\s\S]*?)\[\/purple\]/gi,
      (_, inner) => `<mark data-color="purple" class="${basePillClass} ${getHighlightMarkClasses("purple", theme)}">${inner}</mark>`
    )
    .replace(
      /\[hl:purple\]([\s\S]*?)\[\/hl\]/gi,
      (_, inner) => `<mark data-color="purple" class="${basePillClass} ${getHighlightMarkClasses("purple", theme)}">${inner}</mark>`
    )
    // Bold
    .replace(/\*\*([\s\S]*?)\*\*/g, (_, inner) => `<strong class="font-extrabold">${inner}</strong>`);

  // Strip any lingering raw bracket tags (e.g. [green], [/green], [yellow], etc.) that might have been unclosed or orphan
  html = html.replace(/\[\/?(?:yellow|green|blue|orange|pink|red|purple|hl(?::[a-z]+)?)\]/gi, "");

  // Convert line breaks to <br>
  html = html.replace(/\n/g, "<br>");

  return html;
}

/**
 * Convert HTML DOM tree back to markup tags ([green]...[/green], **bold**, etc.) for storage and PDF export
 */
export function htmlToTags(node: Node): string {
  let result = "";

  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      result += child.textContent || "";
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      const tagName = el.tagName.toUpperCase();

      if (tagName === "BR") {
        result += "\n";
      } else if (tagName === "DIV" || tagName === "P") {
        const inner = htmlToTags(el);
        if (result.length > 0 && !result.endsWith("\n")) {
          result += "\n";
        }
        result += inner;
      } else if (tagName === "MARK") {
        const color = el.getAttribute("data-color") || "yellow";
        const inner = htmlToTags(el);
        // Avoid saving empty tags
        if (inner.trim()) {
          result += `[${color}]${inner}[/${color}]`;
        }
      } else if (tagName === "STRONG" || tagName === "B") {
        const inner = htmlToTags(el);
        if (inner.trim()) {
          result += `**${inner}**`;
        }
      } else {
        result += htmlToTags(el);
      }
    }
  });

  return result;
}

export interface VisualRemarkEditorProps {
  value: string;
  onChange: (newValue: string) => void;
  onSave?: () => void;
  onCancel?: () => void;
  fontSize?: number;
  theme?: "light" | "dark" | "navy";
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
}

export function VisualRemarkEditor({
  value,
  onChange,
  onSave,
  onCancel,
  fontSize = 13,
  theme = "light",
  placeholder = "กรุณากรอกข้อความหมายเหตุ... (ลากคลุมข้อความแล้วเลือกสีไฮไลท์ด้านบน)",
  autoFocus = true,
  compact = false,
}: VisualRemarkEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isRawMode, setIsRawMode] = useState(false);
  const [hintMessage, setHintMessage] = useState<string | null>(null);
  const hintTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isComposingRef = useRef(false);
  const hasMountedRef = useRef(false);

  const isDark = theme === "dark";
  const isNavy = theme === "navy";
  const isDarkOrNavy = isDark || isNavy;

  // Initialize and synchronize HTML content when value or mode changes
  useEffect(() => {
    if (!isRawMode && editorRef.current) {
      const currentTags = htmlToTags(editorRef.current);
      if (currentTags !== value) {
        editorRef.current.innerHTML = tagsToHtml(value, theme);
      }
      if (!hasMountedRef.current) {
        hasMountedRef.current = true;
        if (autoFocus) {
          editorRef.current.focus();
        }
      }
    }
  }, [value, isRawMode, theme, autoFocus]);

  const showHint = (msg: string) => {
    if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
    setHintMessage(msg);
    hintTimeoutRef.current = setTimeout(() => {
      setHintMessage(null);
    }, 3000);
  };

  const handleApplyColor = (color: HighlightColor | "clear") => {
    if (isRawMode) {
      showHint("กรุณาสลับเป็นโหมดแสดงผลจริง (Visual) เพื่อเลือกสี");
      return;
    }

    const editorEl = editorRef.current;
    if (!editorEl) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      showHint("💡 ลากคลุม (Select) ข้อความในกล่องด้านล่างก่อน แล้วกดเลือกสี");
      editorEl.focus();
      return;
    }

    const range = sel.getRangeAt(0);

    // Verify selection is within the editor
    if (!editorEl.contains(range.commonAncestorContainer)) {
      showHint("💡 ลากคลุม (Select) ข้อความในกล่องด้านล่างก่อน แล้วกดเลือกสี");
      editorEl.focus();
      return;
    }

    if (color === "bold") {
      document.execCommand("bold", false);
      const newText = htmlToTags(editorEl);
      onChange(newText);
      return;
    }

    const basePillClass = "inline-block font-bold px-1.5 py-0.5 mx-0.5 rounded-md border shadow-2xs align-baseline cursor-pointer";

    if (color === "clear") {
      // 1. If selection is inside a mark, unwrap it
      let node: Node | null = range.commonAncestorContainer;
      while (node && node !== editorEl) {
        if (node.nodeName === "MARK") {
          const parent = node.parentNode;
          while (node.firstChild) {
            parent?.insertBefore(node.firstChild, node);
          }
          parent?.removeChild(node);
          const newText = htmlToTags(editorEl);
          onChange(newText);
          showHint("ลบไฮไลท์สีออกแล้ว");
          return;
        }
        node = node.parentNode;
      }

      // 2. Also unwrap any marks within the selection range
      if (!range.collapsed) {
        const marks = editorEl.querySelectorAll("mark");
        let unwrapped = false;
        marks.forEach((m) => {
          if (sel.containsNode(m, true)) {
            const parent = m.parentNode;
            while (m.firstChild) {
              parent?.insertBefore(m.firstChild, m);
            }
            parent?.removeChild(m);
            unwrapped = true;
          }
        });
        if (unwrapped) {
          const newText = htmlToTags(editorEl);
          onChange(newText);
          showHint("ลบไฮไลท์สีออกแล้ว");
          return;
        }
      }

      showHint("ไม่พบไฮไลท์ในข้อความที่เลือก");
      return;
    }

    // If cursor is collapsed inside an existing mark, change its color
    if (range.collapsed) {
      let node: Node | null = range.commonAncestorContainer;
      while (node && node !== editorEl) {
        if (node.nodeName === "MARK") {
          const markEl = node as HTMLElement;
          markEl.setAttribute("data-color", color);
          markEl.className = `${basePillClass} ${getHighlightMarkClasses(color, theme)}`;
          const newText = htmlToTags(editorEl);
          onChange(newText);
          showHint(`เปลี่ยนไฮไลท์เป็นสี${color}`);
          return;
        }
        node = node.parentNode;
      }

      showHint("💡 ลากคลุม (Select) ข้อความที่ต้องการเน้น แล้วคลิกเลือกสี");
      return;
    }

    // Text is selected: wrap it with a <mark>
    const mark = document.createElement("mark");
    mark.setAttribute("data-color", color);
    mark.className = `${basePillClass} ${getHighlightMarkClasses(color, theme)}`;

    const selectedContent = range.extractContents();

    // Clean any nested marks inside selection to prevent tag stacking
    const innerMarks = selectedContent.querySelectorAll("mark");
    innerMarks.forEach((m) => {
      while (m.firstChild) {
        m.parentNode?.insertBefore(m.firstChild, m);
      }
      m.parentNode?.removeChild(m);
    });

    mark.appendChild(selectedContent);
    range.insertNode(mark);

    // Keep selection on the newly highlighted text
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(mark);
    sel.addRange(newRange);

    const newText = htmlToTags(editorEl);
    onChange(newText);
  };

  const handleInput = () => {
    if (isComposingRef.current) return;
    if (editorRef.current) {
      const newText = htmlToTags(editorRef.current);
      onChange(newText);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      onSave?.();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel?.();
    }
  };

  return (
    <div className={`flex flex-col ${compact ? "gap-1.5" : "gap-2"}`}>
      {/* Visual Toolbar */}
      <div
        className={`flex flex-wrap items-center justify-between gap-1 sm:gap-1.5 ${
          compact ? "p-1 rounded-lg" : "p-1.5 sm:p-2 rounded-lg"
        } border transition-colors ${
          isDarkOrNavy
            ? "bg-slate-800/90 border-slate-700 text-slate-200"
            : "bg-slate-100/90 border-slate-200 text-slate-700"
        }`}
      >
        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
          <span className="text-[10px] sm:text-[11px] font-bold flex items-center gap-1 text-slate-600 dark:text-slate-300 mr-0.5 select-none">
            <Highlighter className="h-3 w-3 text-amber-500" />
            <span className={compact ? "hidden xs:inline" : ""}>สี:</span>
          </span>

          {HIGHLIGHT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              // onMouseDown preventDefault prevents losing the cursor/text selection
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleApplyColor(opt.key)}
              className={`${
                compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"
              } rounded-md font-semibold border flex items-center gap-1 cursor-pointer transition-all shadow-2xs hover:scale-105 active:scale-95 select-none ${opt.bgClass} ${opt.borderClass}`}
              title={opt.title}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dotColor}`} />
              <span>{opt.label}</span>
            </button>
          ))}

          {/* Bold Button */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleApplyColor("bold")}
            className={`${
              compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"
            } rounded-md font-bold border flex items-center gap-0.5 cursor-pointer transition-all shadow-2xs hover:scale-105 active:scale-95 select-none ${
              isDarkOrNavy
                ? "bg-slate-700 hover:bg-slate-600 border-slate-600 text-white"
                : "bg-white hover:bg-slate-50 border-slate-300 text-slate-900"
            }`}
            title="ทำตัวหนา"
          >
            <Bold className="h-3 w-3" />
            <span>ตัวหนา</span>
          </button>

          {/* Clear Highlight Button */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleApplyColor("clear")}
            className={`${
              compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"
            } rounded-md font-semibold border flex items-center gap-1 cursor-pointer transition-all shadow-2xs hover:scale-105 active:scale-95 select-none ${
              isDarkOrNavy
                ? "bg-slate-700/80 hover:bg-slate-700 text-slate-300 border-slate-600"
                : "bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 border-slate-300 hover:border-rose-200"
            }`}
            title="ลบไฮไลท์สีออกจากข้อความที่เลือก"
          >
            <Eraser className="h-3 w-3 text-rose-500" />
            <span>ลบไฮไลท์</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Toggle raw code mode for advanced users */}
          <button
            type="button"
            onClick={() => {
              if (isRawMode && editorRef.current) {
                // Switching from Raw to Visual
                editorRef.current.innerHTML = tagsToHtml(value, theme);
              }
              setIsRawMode(!isRawMode);
            }}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium border flex items-center gap-1 cursor-pointer transition-colors ${
              isRawMode
                ? "bg-blue-600 text-white border-blue-600 font-bold"
                : "bg-white/80 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"
            }`}
            title={isRawMode ? "สลับไปโหมดแก้ไขเสมือนจริง (WYSIWYG)" : "สลับไปดู/แก้ไขโค้ดข้อความดิบ ([green]...[/green])"}
          >
            {isRawMode ? <Eye className="h-3 w-3" /> : <Code2 className="h-3 w-3" />}
            <span>{isRawMode ? "โหมดแสดงผลจริง" : "โหมดโค้ด"}</span>
          </button>

          {!compact && (
            <div className="text-[10px] text-slate-500 dark:text-slate-400 italic hidden lg:flex items-center gap-1 select-none">
              <Sparkles className="h-3 w-3 text-amber-400" />
              <span>ลากคลุมข้อความแล้วกดสีที่ต้องการ</span>
            </div>
          )}
        </div>
      </div>

      {/* Real-time Hint Toast if user didn't select text */}
      {hintMessage && (
        <div className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800/60 animate-fadeIn">
          <Info className="h-3 w-3 text-amber-600 shrink-0" />
          <span>{hintMessage}</span>
        </div>
      )}

      {/* Editor Body */}
      {isRawMode ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={compact ? 2 : 3}
          style={{ fontSize: `${fontSize}px` }}
          className={`w-full px-3 py-2 border rounded-lg font-mono leading-relaxed resize-y focus:outline-emerald-500 ${
            isDark
              ? "bg-slate-800 border-slate-700 text-slate-100"
              : isNavy
              ? "bg-[#192C4E] border-[#1F3358] text-white"
              : "bg-slate-50 border-slate-300 text-slate-900"
          }`}
          placeholder={placeholder}
          autoFocus
        />
      ) : (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
            handleInput();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          style={{ fontSize: `${fontSize}px` }}
          className={`w-full ${
            compact ? "min-h-[48px] max-h-[200px] px-2.5 py-2" : "min-h-[80px] max-h-[260px] px-3 py-2.5"
          } overflow-y-auto border rounded-lg leading-relaxed font-medium focus:outline-emerald-500 whitespace-pre-wrap break-words transition-colors shadow-2xs ${
            isDark
              ? "bg-slate-800/90 border-emerald-500/80 text-white focus:border-emerald-400"
              : isNavy
              ? "bg-[#192C4E] border-emerald-500/80 text-white focus:border-emerald-400"
              : "bg-emerald-50/20 border-emerald-400 text-slate-800 focus:border-emerald-500"
          }`}
          data-placeholder={placeholder}
        />
      )}
    </div>
  );
}
