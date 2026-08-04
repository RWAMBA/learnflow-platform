import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { QuestionType } from "../constants";

export interface AnswerValue {
  choices?: string[];
  text?: string;
  value?: string;
  order?: string[];
  fileName?: string;
}

interface QuestionShape {
  id: string;
  question_type: string;
  prompt: string;
  body: unknown;
}

function optionsOf(question: QuestionShape) {
  const body = (question.body ?? {}) as { options?: { id: string; text: string }[] };
  return body.options ?? [];
}

/** Renders the learner-facing input for one question type. */
export function AnswerField({
  question,
  value,
  disabled,
  onChange,
}: {
  question: QuestionShape;
  value: AnswerValue;
  disabled?: boolean;
  onChange: (next: AnswerValue) => void;
}) {
  const type = question.question_type as QuestionType;
  const options = optionsOf(question);

  if (type === "multiple_choice" || type === "true_false") {
    return (
      <RadioGroup
        disabled={disabled}
        value={value.choices?.[0] ?? ""}
        onValueChange={(next) => onChange({ choices: [next] })}
        className="space-y-2"
      >
        {options.map((option) => (
          <div key={option.id} className="flex items-center gap-2">
            <RadioGroupItem value={option.id} id={`${question.id}-${option.id}`} />
            <Label htmlFor={`${question.id}-${option.id}`} className="font-normal">
              {option.text}
            </Label>
          </div>
        ))}
      </RadioGroup>
    );
  }

  if (type === "multiple_response") {
    const selected = value.choices ?? [];
    return (
      <div className="space-y-2">
        {options.map((option) => (
          <div key={option.id} className="flex items-center gap-2">
            <Checkbox
              id={`${question.id}-${option.id}`}
              disabled={disabled}
              checked={selected.includes(option.id)}
              onCheckedChange={(checked) =>
                onChange({
                  choices: checked
                    ? [...selected, option.id]
                    : selected.filter((id) => id !== option.id),
                })
              }
            />
            <Label htmlFor={`${question.id}-${option.id}`} className="font-normal">
              {option.text}
            </Label>
          </div>
        ))}
      </div>
    );
  }

  if (type === "ordering") {
    const order = value.order ?? options.map((option) => option.id);
    const move = (index: number, delta: number) => {
      const next = [...order];
      const target = index + delta;
      if (target < 0 || target >= next.length) return;
      [next[index], next[target]] = [next[target]!, next[index]!];
      onChange({ order: next });
    };
    return (
      <ol className="space-y-2">
        {order.map((id, index) => (
          <li key={id} className="flex items-center justify-between rounded-md border px-3 py-2">
            <span>{options.find((option) => option.id === id)?.text ?? id}</span>
            <span className="flex gap-1">
              <button
                type="button"
                disabled={disabled || index === 0}
                onClick={() => move(index, -1)}
                className="rounded px-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={disabled || index === order.length - 1}
                onClick={() => move(index, 1)}
                className="rounded px-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
                aria-label="Move down"
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
    );
  }

  if (type === "numeric") {
    return (
      <Input
        type="number"
        disabled={disabled}
        value={value.value ?? ""}
        onChange={(event) => onChange({ value: event.target.value })}
        aria-label="Your answer"
      />
    );
  }

  if (type === "short_answer" || type === "fill_blank" || type === "matching") {
    return (
      <Input
        disabled={disabled}
        value={value.text ?? ""}
        onChange={(event) => onChange({ text: event.target.value })}
        aria-label="Your answer"
      />
    );
  }

  if (type === "file_upload" || type === "drawing" || type === "audio_response" || type === "video_response") {
    return (
      <div className="space-y-2">
        <Input
          type="file"
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, fileName: event.target.files?.[0]?.name ?? undefined })
          }
          aria-label="Upload your response"
        />
        <Textarea
          disabled={disabled}
          placeholder="Add a note about your submission"
          value={value.text ?? ""}
          onChange={(event) => onChange({ ...value, text: event.target.value })}
        />
        {value.fileName ? (
          <p className="text-sm text-muted-foreground">Attached: {value.fileName}</p>
        ) : null}
      </div>
    );
  }

  return (
    <Textarea
      rows={6}
      disabled={disabled}
      value={value.text ?? ""}
      onChange={(event) => onChange({ text: event.target.value })}
      aria-label="Your answer"
    />
  );
}