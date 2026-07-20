export interface Task {
  id: string;
  text: string;
  memo?: string;
  range: [string, string];
  isDone: boolean;
  color?: string | null;
}

export interface TaskState {
  [date: string]: Task[];
}
