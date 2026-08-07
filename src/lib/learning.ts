import { appendProjectLearning } from './project.js';
import { findTask, loadTask, saveTask, appendLog } from './task.js';
export function recordTaskLearning(root: any, id: any, text: any) {
    const task = loadTask(findTask(root, id));
    const result = appendProjectLearning(root, { taskId: task.meta.id, text });
    task.meta.learning_recorded = true;
    appendLog(task, 'Durable project learning recorded.');
    saveTask(task);
    return result;
}
