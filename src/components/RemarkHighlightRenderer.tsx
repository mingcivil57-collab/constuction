import React from "react";
import { Highlighter, Bold, Sparkles, HelpCircle } from "lucide-react";

export type HighlightColor = "yellow" | "green" | "blue" | "orange" | "pink" | "purple" | "bold";

export interface HighlightOption {
  key: HighlightColor;
  label: string;
  dotColor: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  title: string;
}

export const HIGHLIGHT_OPTIONS: HighlightOption[] = [
  {
    key: "yellow",
    label: "เหลือง",
    dotColor: "bg-amber-400",
    bgClass: "bg-amber-100 hover:bg-amber-200 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 text-amber-900 dark:text-amber-200",
    borderClass: "border-amber-300 dark:border-amber-500/40",
    textClass: "text-amber-950",
    title: "ไฮไลท์สีเหลือง (เน้นข้อมูลทั่วไป / ปริมาณงาน)",
  },
  {
    key: "green",
    label: "เขียว",
    dotColor: "bg-emerald-500",
    bgClass: "bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30 text-emerald-900 dark:text-emerald-200",
    borderClass: "border-emerald-300 dark:border-emerald-500/40",
    textClass: "text-emerald-950",
    title: "ไฮไลท์สีเขียว (งานเสร็จ 100% / ผลงานผ่าน)",
  },
  {
    key: "blue",
    label: "ฟ้า",
    dotColor: "bg-sky-500",
    bgClass: "bg-sky-100 hover:bg-sky-200 dark:bg-sky-500/20 dark:hover:bg-sky-500/30 text-sky-900 dark:text-sky-200",
    borderClass: "border-sky-300 dark:border-sky-500/40",
    textClass: "text-sky-950",
    title: "ไฮไลท์สีฟ้า (ยอดสะสม / ข้อมูลเปรียบเทียบ)",
  },
  {
    key: "orange",
    label: "ส้ม",
    dotColor: "bg-orange-500",
    bgClass: "bg-orange-100 hover:bg-orange-200 dark:bg-orange-500/20 dark:hover:bg-orange-500/30 text-orange-900 dark:text-orange-200",
    borderClass: "border-orange-300 dark:border-orange-500/40",
    textClass: "text-orange-950",
    title: "ไฮไลท์สีส้ม (อยู่ระหว่างทำ / ยอดรอเบิก)",
  },
  {
    key: "pink",
    label: "ชมพู/แดง",
    dotColor: "bg-rose-500",
    bgClass: "bg-rose-100 hover:bg-rose-200 dark:bg-rose-500/20 dark:hover:bg-rose-500/30 text-rose-900 dark:text-rose-200",
    borderClass: "border-rose-300 dark:border-rose-500/40",
    textClass: "text-rose-950",
    title: "ไฮไลท์สีชมพู/แดง (จุดต้องระวัง / งานติดขัด)",
  },
  {
    key: "purple",
    label: "ม่วง",
    dotColor: "bg-purple-500",
    bgClass: "bg-purple-100 hover:bg-purple-200 dark:bg-purple-500/20 dark:hover:bg-purple-500/30 text-purple-900 dark:text-purple-200",
    borderClass: "border-purple-300 dark:border-purple-500/40",
    textClass: "text-purple-950",
    title: "ไฮไลท์สีม่วง (หัวข้อพิเศษ / ค่า K / สัญญา)",
  },
];

/**
 * Get CSS classes for rendering highlight mark pills across different themes
 */
export function getHighlightMarkClasses(
  color: string,
  theme: "light" | "dark" | "navy" = "light"
): string {
  const isDark = theme === "dark";
  const isNavy = theme === "navy";

  switch (color) {
    case "yellow":
      return isDark
        ? "bg-amber-500/25 text-amber-300 border-amber-500/50"
        : isNavy
        ? "bg-amber-400/20 text-amber-200 border-amber-400/40"
        : "bg-amber-200/90 text-amber-950 border-amber-300/90";
    case "green":
      return isDark
        ? "bg-emerald-500/25 text-emerald-300 border-emerald-500/50"
        : isNavy
        ? "bg-emerald-400/20 text-emerald-200 border-emerald-400/40"
        : "bg-emerald-200/90 text-emerald-950 border-emerald-300/90";
    case "blue":
      return isDark
        ? "bg-sky-500/25 text-sky-300 border-sky-500/50"
        : isNavy
        ? "bg-sky-400/20 text-sky-200 border-sky-400/40"
        : "bg-sky-200/90 text-sky-950 border-sky-300/90";
    case "orange":
      return isDark
        ? "bg-orange-500/25 text-orange-300 border-orange-500/50"
        : isNavy
        ? "bg-orange-400/20 text-orange-200 border-orange-400/40"
        : "bg-orange-200/90 text-orange-950 border-orange-300/90";
    case "pink":
    case "red":
      return isDark
        ? "bg-rose-500/25 text-rose-300 border-rose-500/50"
        : isNavy
        ? "bg-rose-400/20 text-rose-200 border-rose-400/40"
        : "bg-rose-200/90 text-rose-950 border-rose-300/90";
    case "purple":
      return isDark
        ? "bg-purple-500/25 text-purple-300 border-purple-500/50"
        : isNavy
        ? "bg-purple-400/20 text-purple-200 border-purple-400/40"
        : "bg-purple-200/90 text-purple-950 border-purple-300/90";
    default:
      return "bg-amber-200/90 text-amber-950 border-amber-300/90";
  }
}

/**
 * Apply highlight formatting tags to selected text in textarea
 */
export function applyHighlightToTextarea(
  textarea: HTMLTextAreaElement | null,
  color: HighlightColor,
  currentText: string,
  setText: (newText: string) => void
) {
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = currentText.substring(start, end);

  let openTag = `[${color}]`;
  let closeTag = `[/${color}]`;
  if (color === "bold") {
    openTag = "**";
    closeTag = "**";
  }

  const replacement = selectedText
    ? `${openTag}${selectedText}${closeTag}`
    : `${openTag}ข้อความที่ต้องการเน้น${closeTag}`;

  const newText =
    currentText.substring(0, start) +
    replacement +
    currentText.substring(end);

  setText(newText);

  // Restore cursor and focus
  setTimeout(() => {
    textarea.focus();
    if (selectedText) {
      textarea.setSelectionRange(start, start + replacement.length);
    } else {
      const cursorStart = start + openTag.length;
      const cursorEnd = cursorStart + "ข้อความที่ต้องการเน้น".length;
      textarea.setSelectionRange(cursorStart, cursorEnd);
    }
  }, 20);
}

/**
 * Component: Toolbar for selecting highlight colors in the remark editor
 */
interface RemarkHighlightToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  currentText: string;
  onTextChange: (newText: string) => void;
  theme?: "light" | "dark" | "navy";
}

export function RemarkHighlightToolbar({
  textareaRef,
  currentText,
  onTextChange,
  theme = "light",
}: RemarkHighlightToolbarProps) {
  const isDarkOrNavy = theme === "dark" || theme === "navy";

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-1.5 p-1.5 sm:p-2 rounded-lg border transition-colors ${
        isDarkOrNavy
          ? "bg-slate-800/90 border-slate-700 text-slate-200"
          : "bg-slate-100/90 border-slate-200 text-slate-700"
      }`}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] font-bold flex items-center gap-1 text-slate-600 dark:text-slate-300 mr-1 select-none">
          <Highlighter className="h-3.5 w-3.5 text-amber-500" />
          <span>ไฮไลท์สี:</span>
        </span>

        {HIGHLIGHT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() =>
              applyHighlightToTextarea(
                textareaRef.current,
                opt.key,
                currentText,
                onTextChange
              )
            }
            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border flex items-center gap-1 cursor-pointer transition-all shadow-2xs hover:scale-105 active:scale-95 ${opt.bgClass} ${opt.borderClass}`}
            title={opt.title}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dotColor}`} />
            <span>{opt.label}</span>
          </button>
        ))}

        <button
          type="button"
          onClick={() =>
            applyHighlightToTextarea(
              textareaRef.current,
              "bold",
              currentText,
              onTextChange
            )
          }
          className={`px-2 py-0.5 rounded-md text-[11px] font-bold border flex items-center gap-0.5 cursor-pointer transition-all shadow-2xs hover:scale-105 active:scale-95 ${
            isDarkOrNavy
              ? "bg-slate-700 hover:bg-slate-600 border-slate-600 text-white"
              : "bg-white hover:bg-slate-50 border-slate-300 text-slate-900"
          }`}
          title="ทำตัวหนา (**ข้อความ**)"
        >
          <Bold className="h-3 w-3" />
          <span>ตัวหนา</span>
        </button>
      </div>

      <div className="text-[10px] text-slate-500 dark:text-slate-400 italic hidden md:flex items-center gap-1">
        <Sparkles className="h-3 w-3 text-amber-400" />
        <span>ลากคลุมข้อความแล้วกดสีที่ต้องการ</span>
      </div>
    </div>
  );
}

/**
 * Render formatted text with highlights & bolding
 */
interface FormattedRemarkTextProps {
  text: string;
  theme?: "light" | "dark" | "navy";
  className?: string;
  style?: React.CSSProperties;
}

export function FormattedRemarkText({
  text,
  theme = "light",
  className = "",
  style,
}: FormattedRemarkTextProps) {
  if (!text) return null;

  const isDark = theme === "dark";
  const isNavy = theme === "navy";
  const isDarkOrNavy = isDark || isNavy;

  // Regex pattern for all supported formatting tags
  const tokenRegex =
    /(\[yellow\][\s\S]*?\[\/yellow\]|\[green\][\s\S]*?\[\/green\]|\[blue\][\s\S]*?\[\/blue\]|\[orange\][\s\S]*?\[\/orange\]|\[(?:pink|red)\][\s\S]*?\[\/(?:pink|red)\]|\[purple\][\s\S]*?\[\/purple\]|\[hl:(?:yellow|green|blue|orange|pink|red|purple)\][\s\S]*?\[\/hl\]|==[\s\S]*?==|\*\*[\s\S]*?\*\*)/g;

  const parts = text.split(tokenRegex);

  const renderInner = (rawStr: string, keyPrefix: string): React.ReactNode => {
    // If has bold tags inside
    if (rawStr.includes("**")) {
      const boldParts = rawStr.split(/(\*\*[\s\S]*?\*\*)/g);
      return boldParts.map((bp, bIdx) => {
        if (bp.startsWith("**") && bp.endsWith("**") && bp.length >= 4) {
          return (
            <strong key={`${keyPrefix}-b-${bIdx}`} className="font-extrabold">
              {bp.slice(2, -2)}
            </strong>
          );
        }
        return bp;
      });
    }
    return rawStr;
  };

  return (
    <div
      className={`leading-relaxed break-words whitespace-pre-wrap ${className}`}
      style={style}
    >
      {parts.map((part, idx) => {
        if (!part) return null;

        // 1. Yellow Highlight: [yellow]...[/yellow] or [hl:yellow]...[/hl] or ==...==
        if (
          (part.startsWith("[yellow]") && part.endsWith("[/yellow]")) ||
          (part.startsWith("[hl:yellow]") && part.endsWith("[/hl]")) ||
          (part.startsWith("==") && part.endsWith("==") && part.length >= 4)
        ) {
          let inner = part;
          if (part.startsWith("[yellow]")) inner = part.slice(8, -9);
          else if (part.startsWith("[hl:yellow]")) inner = part.slice(11, -5);
          else if (part.startsWith("==")) inner = part.slice(2, -2);

          return (
            <mark
              key={`hl-y-${idx}`}
              className={`inline-block font-bold px-1.5 py-0.5 mx-0.5 rounded-md border shadow-2xs transition-colors align-baseline ${
                isDark
                  ? "bg-amber-500/25 text-amber-300 border-amber-500/50"
                  : isNavy
                  ? "bg-amber-400/20 text-amber-200 border-amber-400/40"
                  : "bg-amber-200/90 text-amber-950 border-amber-300/90"
              }`}
            >
              {renderInner(inner, `y-${idx}`)}
            </mark>
          );
        }

        // 2. Green Highlight: [green]...[/green] or [hl:green]...[/hl]
        if (
          (part.startsWith("[green]") && part.endsWith("[/green]")) ||
          (part.startsWith("[hl:green]") && part.endsWith("[/hl]"))
        ) {
          const inner = part.startsWith("[green]")
            ? part.slice(7, -8)
            : part.slice(10, -5);

          return (
            <mark
              key={`hl-g-${idx}`}
              className={`inline-block font-bold px-1.5 py-0.5 mx-0.5 rounded-md border shadow-2xs transition-colors align-baseline ${
                isDark
                  ? "bg-emerald-500/25 text-emerald-300 border-emerald-500/50"
                  : isNavy
                  ? "bg-emerald-400/20 text-emerald-200 border-emerald-400/40"
                  : "bg-emerald-200/90 text-emerald-950 border-emerald-300/90"
              }`}
            >
              {renderInner(inner, `g-${idx}`)}
            </mark>
          );
        }

        // 3. Blue Highlight: [blue]...[/blue] or [hl:blue]...[/hl]
        if (
          (part.startsWith("[blue]") && part.endsWith("[/blue]")) ||
          (part.startsWith("[hl:blue]") && part.endsWith("[/hl]"))
        ) {
          const inner = part.startsWith("[blue]")
            ? part.slice(6, -7)
            : part.slice(9, -5);

          return (
            <mark
              key={`hl-b-${idx}`}
              className={`inline-block font-bold px-1.5 py-0.5 mx-0.5 rounded-md border shadow-2xs transition-colors align-baseline ${
                isDark
                  ? "bg-sky-500/25 text-sky-300 border-sky-500/50"
                  : isNavy
                  ? "bg-sky-400/20 text-sky-200 border-sky-400/40"
                  : "bg-sky-200/90 text-sky-950 border-sky-300/90"
              }`}
            >
              {renderInner(inner, `b-${idx}`)}
            </mark>
          );
        }

        // 4. Orange Highlight: [orange]...[/orange] or [hl:orange]...[/hl]
        if (
          (part.startsWith("[orange]") && part.endsWith("[/orange]")) ||
          (part.startsWith("[hl:orange]") && part.endsWith("[/hl]"))
        ) {
          const inner = part.startsWith("[orange]")
            ? part.slice(8, -9)
            : part.slice(11, -5);

          return (
            <mark
              key={`hl-o-${idx}`}
              className={`inline-block font-bold px-1.5 py-0.5 mx-0.5 rounded-md border shadow-2xs transition-colors align-baseline ${
                isDark
                  ? "bg-orange-500/25 text-orange-300 border-orange-500/50"
                  : isNavy
                  ? "bg-orange-400/20 text-orange-200 border-orange-400/40"
                  : "bg-orange-200/90 text-orange-950 border-orange-300/90"
              }`}
            >
              {renderInner(inner, `o-${idx}`)}
            </mark>
          );
        }

        // 5. Pink / Red Highlight: [pink]...[/pink] or [red]...[/red] or [hl:pink]...[/hl] or [hl:red]...[/hl]
        if (
          (part.startsWith("[pink]") && part.endsWith("[/pink]")) ||
          (part.startsWith("[red]") && part.endsWith("[/red]")) ||
          (part.startsWith("[hl:pink]") && part.endsWith("[/hl]")) ||
          (part.startsWith("[hl:red]") && part.endsWith("[/hl]"))
        ) {
          let inner = part;
          if (part.startsWith("[pink]")) inner = part.slice(6, -7);
          else if (part.startsWith("[red]")) inner = part.slice(5, -6);
          else if (part.startsWith("[hl:pink]")) inner = part.slice(9, -5);
          else if (part.startsWith("[hl:red]")) inner = part.slice(8, -5);

          return (
            <mark
              key={`hl-p-${idx}`}
              className={`inline-block font-bold px-1.5 py-0.5 mx-0.5 rounded-md border shadow-2xs transition-colors align-baseline ${
                isDark
                  ? "bg-rose-500/25 text-rose-300 border-rose-500/50"
                  : isNavy
                  ? "bg-rose-400/20 text-rose-200 border-rose-400/40"
                  : "bg-rose-200/90 text-rose-950 border-rose-300/90"
              }`}
            >
              {renderInner(inner, `p-${idx}`)}
            </mark>
          );
        }

        // 6. Purple Highlight: [purple]...[/purple] or [hl:purple]...[/hl]
        if (
          (part.startsWith("[purple]") && part.endsWith("[/purple]")) ||
          (part.startsWith("[hl:purple]") && part.endsWith("[/hl]"))
        ) {
          const inner = part.startsWith("[purple]")
            ? part.slice(8, -9)
            : part.slice(11, -5);

          return (
            <mark
              key={`hl-pur-${idx}`}
              className={`inline-block font-bold px-1.5 py-0.5 mx-0.5 rounded-md border shadow-2xs transition-colors align-baseline ${
                isDark
                  ? "bg-purple-500/25 text-purple-300 border-purple-500/50"
                  : isNavy
                  ? "bg-purple-400/20 text-purple-200 border-purple-400/40"
                  : "bg-purple-200/90 text-purple-950 border-purple-300/90"
              }`}
            >
              {renderInner(inner, `pur-${idx}`)}
            </mark>
          );
        }

        // 7. Bold text: **...**
        if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
          const inner = part.slice(2, -2);
          return (
            <strong
              key={`bold-${idx}`}
              className={`font-extrabold ${
                isDarkOrNavy ? "text-white" : "text-slate-900"
              }`}
            >
              {inner}
            </strong>
          );
        }

        // Normal plain text
        return <span key={`text-${idx}`}>{part}</span>;
      })}
    </div>
  );
}
