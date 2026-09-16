import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/** Renders generated markdown as React (no raw HTML), in the reading measure. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("prose-reading", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}
