import { getEcoTasks } from "@/db/queries";
import { QuestionForm } from "./question-form";

export const dynamic = "force-dynamic";

export default async function NewQuestionPage() {
  const tasks = await getEcoTasks();
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Add a question by hand</h1>
        <p className="text-sm text-muted">
          Same schema the generator will use. Every wrong option needs a distractor family; every option needs a rationale.
        </p>
      </header>
      <QuestionForm tasks={tasks.map((t) => ({ id: t.id, title: t.title, domain: t.domain }))} />
    </div>
  );
}
