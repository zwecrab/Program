"use client";

import { useState } from "react";
import { Button, CardTitle, Dialog, DialogContent, DialogTrigger, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Tooltip } from "@/components/ui";
import { CitationStrip } from "@/components/citations";

export function DesignInteractive() {
  const [on, setOn] = useState(true);
  return (
    <section className="space-y-3">
      <CardTitle>Interactive</CardTitle>
      <div className="flex flex-wrap items-center gap-3">
        <Switch checked={on} onCheckedChange={setOn} label="Timed" />
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary" size="sm">
              Open dialog
            </Button>
          </DialogTrigger>
          <DialogContent title="Source excerpt">
            <p className="text-sm text-fg-muted">Dialog body.</p>
          </DialogContent>
        </Dialog>
        <Tooltip content="Tooltip content">
          <Button variant="ghost" size="sm">
            Hover me
          </Button>
        </Tooltip>
      </div>
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">By task</TabsTrigger>
          <TabsTrigger value="b">By domain</TabsTrigger>
        </TabsList>
        <TabsContent value="a" className="pt-2 text-sm text-fg-muted">
          Tab A
        </TabsContent>
        <TabsContent value="b" className="pt-2 text-sm text-fg-muted">
          Tab B
        </TabsContent>
      </Tabs>
      <CitationStrip
        support="high"
        citations={[
          { chunk_id: 0, source_book: "PMBOK Guide 8th ed.", source_section: "Guide §2.7 Risk › 2.7.3 Plan Risk Responses", printed_page: "201", pdf_page: 203 },
          { chunk_id: 0, source_book: "PMBOK Guide 8th ed.", source_section: "Guide §2.4 Finance › 2.4.2 Reserves", printed_page: "168", pdf_page: 170 },
        ]}
      />
    </section>
  );
}
