import React, { useState, useEffect, useReducer, useMemo, useRef } from 'react';
import {
  LayoutDashboard,
  CheckSquare,
  Flame,
  Calendar as CalendarIcon,
  Timer,
  Target,
  BarChart2,
  Settings as SettingsIcon,
  Plus,
  Search,
  Undo2,
  Redo2,
  Sun,
  Moon,
  Menu,
  X,
  Play,
  Pause,
  RotateCcw,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Circle,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Trash2,
  Download,
  Upload,
  ArrowRight,
} from 'lucide-react';
import confetti from 'canvas-confetti';

/* ==========================================================================
   1. TYPES
   ========================================================================== */
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'in_progress' | 'completed';
export type Category = 'Work' | 'Personal' | 'Health' | 'Learning' | 'Finance' | 'Creative' | 'Other';
export type HabitFrequency = 'daily' | 'weekdays' | 'custom';
export type ViewTab = 'dashboard' | 'tasks' | 'habits' | 'calendar' | 'focus' | 'goals' | 'analytics' | 'settings';

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  status: TaskStatus;
  dueDate: string; // YYYY-MM-DD
  category: Category;
  estimatedDuration: number; // minutes
  goalId?: string;
  completedAt?: string;
}

export interface Habit {
  id: string;
  title: string;
  description?: string;
  category: Category;
  frequency: HabitFrequency;
  scheduledDays: number[]; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  color: string;
  completedDates: string[]; // YYYY-MM-DD
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  category: Category;
  location?: string;
}

export interface Milestone {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: string;
}

export interface Goal {
  id: string;
  title: string;
  description?: string;
  category: Category;
  targetDate: string; // YYYY-MM-DD
  milestones: Milestone[];
}

export interface FocusSession {
  id: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  taskId?: string;
  taskTitle?: string;
  category: Category;
  notes?: string;
  completed: boolean;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  userName: string;
  userTitle: string;
  focusDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  dailyFocusGoalMinutes: number;
  soundEnabled: boolean;
}

export interface ProductivityState {
  tasks: Task[];
  habits: Habit[];
  events: CalendarEvent[];
  goals: Goal[];
  focusSessions: FocusSession[];
  settings: AppSettings;
}

/* ==========================================================================
   2. UTILITIES & SOUND
   ========================================================================== */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTodayDateString(): string {
  return formatDate(new Date());
}

export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = parseDate(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function getDaysDiffFromToday(dateStr: string): number {
  const target = parseDate(dateStr);
  const today = parseDate(getTodayDateString());
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function isTaskOverdue(dueDate: string, isCompleted: boolean): boolean {
  if (isCompleted || !dueDate) return false;
  return getDaysDiffFromToday(dueDate) < 0;
}

export function getRecentDateStrings(numDays: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(formatDate(d));
  }
  return dates;
}

export function isHabitScheduledOnDate(habit: Habit, dateStr: string): boolean {
  const date = parseDate(dateStr);
  return habit.scheduledDays.includes(date.getDay());
}

// Streak calculation respecting scheduled days vs rest days
export function calculateHabitStreaks(habit: Habit): { currentStreak: number; longestStreak: number } {
  const completedSet = new Set(habit.completedDates);
  const todayStr = getTodayDateString();
  const todayDate = parseDate(todayStr);

  if (!habit.scheduledDays || habit.scheduledDays.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  let currentStreak = 0;
  const cursor = new Date(todayDate);
  const isTodayScheduled = habit.scheduledDays.includes(todayDate.getDay());
  const isTodayCompleted = completedSet.has(todayStr);

  if (isTodayScheduled && isTodayCompleted) {
    currentStreak++;
    cursor.setDate(cursor.getDate() - 1);
  } else {
    cursor.setDate(cursor.getDate() - 1);
  }

  let lookback = 365;
  while (lookback > 0) {
    const dStr = formatDate(cursor);
    const dayOfWeek = cursor.getDay();
    const isScheduled = habit.scheduledDays.includes(dayOfWeek);

    if (isScheduled) {
      if (completedSet.has(dStr)) {
        currentStreak++;
      } else {
        break; // missed scheduled day ends streak
      }
    }
    cursor.setDate(cursor.getDate() - 1);
    lookback--;
  }

  let longestStreak = currentStreak;
  let tempStreak = 0;
  const scanDate = new Date(todayDate);
  scanDate.setDate(scanDate.getDate() - 90);

  while (scanDate <= todayDate) {
    const dStr = formatDate(scanDate);
    const isScheduled = habit.scheduledDays.includes(scanDate.getDay());
    if (isScheduled) {
      if (completedSet.has(dStr)) {
        tempStreak++;
        if (tempStreak > longestStreak) longestStreak = tempStreak;
      } else {
        tempStreak = 0;
      }
    }
    scanDate.setDate(scanDate.getDate() + 1);
  }

  return { currentStreak, longestStreak };
}

export function calculateHabitCompletionRate(habit: Habit, daysCount: number = 30): number {
  const dates = getRecentDateStrings(daysCount);
  let scheduled = 0;
  let completed = 0;
  const completedSet = new Set(habit.completedDates);

  for (const d of dates) {
    if (isHabitScheduledOnDate(habit, d)) {
      scheduled++;
      if (completedSet.has(d)) completed++;
    }
  }
  return scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100);
}

export function detectEventConflicts(events: CalendarEvent[]): Map<string, string[]> {
  const conflictsMap = new Map<string, string[]>();
  const byDate: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    if (!byDate[ev.date]) byDate[ev.date] = [];
    byDate[ev.date].push(ev);
  }

  for (const date in byDate) {
    const list = byDate[date];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.startTime < b.endTime && a.endTime > b.startTime) {
          const lA = conflictsMap.get(a.id) || [];
          lA.push(b.title);
          conflictsMap.set(a.id, lA);

          const lB = conflictsMap.get(b.id) || [];
          lB.push(a.title);
          conflictsMap.set(b.id, lB);
        }
      }
    }
  }
  return conflictsMap;
}

// Web Audio API synthesized tones
export function playChime(type: 'start' | 'pause' | 'complete') {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    if (type === 'start') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'pause') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.15);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } else {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(freq, now + idx * 0.1);
        g.gain.setValueAtTime(0.2, now + idx * 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.5);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(now + idx * 0.1);
        o.stop(now + idx * 0.1 + 0.5);
      });
    }
  } catch (e) {}
}

/* ==========================================================================
   3. SAMPLE DATA GENERATOR
   ========================================================================== */
export function generateInitialData(): ProductivityState {
  const now = new Date();
  const getOffset = (d: number) => {
    const x = new Date(now);
    x.setDate(x.getDate() + d);
    return formatDate(x);
  };

  const todayStr = getOffset(0);
  const yesterdayStr = getOffset(-1);
  const tomorrowStr = getOffset(1);
  const overdueStr = getOffset(-2);

  return {
    tasks: [
      {
        id: 't-1',
        title: 'Review infrastructure scalability benchmarks',
        description: 'Check latency curves under synthetic 50k QPS load.',
        priority: 'urgent',
        status: 'todo',
        dueDate: overdueStr,
        category: 'Work',
        estimatedDuration: 45,
        goalId: 'g-1',
      },
      {
        id: 't-2',
        title: 'Review pull requests & merge core features',
        description: 'Verify unit test pass rates and accessibility attributes.',
        priority: 'high',
        status: 'in_progress',
        dueDate: todayStr,
        category: 'Work',
        estimatedDuration: 30,
        goalId: 'g-1',
      },
      {
        id: 't-3',
        title: 'Morning 5km endurance run',
        description: 'Keep heart rate in Zone 2 along the canal route.',
        priority: 'medium',
        status: 'completed',
        dueDate: todayStr,
        category: 'Health',
        estimatedDuration: 35,
        completedAt: `${todayStr}T07:30:00Z`,
      },
      {
        id: 't-4',
        title: 'Draft quarterly budget reallocation ledger',
        description: 'Map out cloud savings and tooling investments.',
        priority: 'high',
        status: 'todo',
        dueDate: tomorrowStr,
        category: 'Finance',
        estimatedDuration: 60,
      },
      {
        id: 't-5',
        title: 'Study Raft consensus leader election rules',
        description: 'Document randomized election timeouts and heartbeat cadence.',
        priority: 'medium',
        status: 'todo',
        dueDate: getOffset(3),
        category: 'Learning',
        estimatedDuration: 50,
        goalId: 'g-2',
      },
    ],
    habits: [
      {
        id: 'h-1',
        title: 'Deep Engineering Reading',
        description: 'Read 20 pages of distributed systems literature.',
        category: 'Learning',
        frequency: 'daily',
        scheduledDays: [0, 1, 2, 3, 4, 5, 6],
        color: '#6366f1',
        completedDates: [getOffset(-4), getOffset(-3), getOffset(-2), yesterdayStr, todayStr],
      },
      {
        id: 'h-2',
        title: 'Cardio & Strength Conditioning',
        description: 'Workout routine (Mon, Wed, Fri).',
        category: 'Health',
        frequency: 'custom',
        scheduledDays: [1, 3, 5],
        color: '#10b981',
        completedDates: [getOffset(-12), getOffset(-7), getOffset(-5), getOffset(-3)],
      },
      {
        id: 'h-3',
        title: 'Zero Screen Time 45m Before Bed',
        description: 'Wind down with physical book or meditation.',
        category: 'Health',
        frequency: 'daily',
        scheduledDays: [0, 1, 2, 3, 4, 5, 6],
        color: '#8b5cf6',
        completedDates: [getOffset(-3), getOffset(-2), yesterdayStr],
      },
      {
        id: 'h-4',
        title: 'Hydration 2.5 Liters Water',
        description: 'Keep water bottle filled at desk.',
        category: 'Health',
        frequency: 'daily',
        scheduledDays: [0, 1, 2, 3, 4, 5, 6],
        color: '#06b6d4',
        completedDates: [getOffset(-4), getOffset(-3), getOffset(-2), yesterdayStr, todayStr],
      },
    ],
    events: [
      {
        id: 'e-1',
        title: 'Sprint Planning & Backlog Grooming',
        date: todayStr,
        startTime: '10:00',
        endTime: '11:15',
        category: 'Work',
        location: 'Virtual Room A',
      },
      {
        id: 'e-2',
        title: 'Staff Engineer Architecture Sync',
        date: todayStr,
        startTime: '11:00', // Intentionally overlaps with e-1 to demonstrate conflict detection!
        endTime: '11:45',
        category: 'Work',
        location: 'Conf Room 302',
      },
      {
        id: 'e-3',
        title: 'Deep Work Code Implementation',
        date: todayStr,
        startTime: '14:00',
        endTime: '16:00',
        category: 'Work',
        location: 'Focus Station',
      },
      {
        id: 'e-4',
        title: 'Product Usability Walkthrough',
        date: tomorrowStr,
        startTime: '13:00',
        endTime: '14:00',
        category: 'Work',
        location: 'Design Studio',
      },
    ],
    goals: [
      {
        id: 'g-1',
        title: 'Ship Production Infrastructure V2',
        description: 'Achieve zero-downtime database cutover and sub-50ms p99 latency.',
        category: 'Work',
        targetDate: getOffset(7),
        milestones: [
          { id: 'm-1-1', title: 'Complete shadow traffic load tests', completed: true },
          { id: 'm-1-2', title: 'Validate automated failover runbooks', completed: true },
          { id: 'm-1-3', title: 'Perform security compliance audit', completed: false },
          { id: 'm-1-4', title: 'Execute live production cutover', completed: false },
        ],
      },
      {
        id: 'g-2',
        title: 'Master Distributed Consensus Patterns',
        description: 'Build complete Raft simulation in TypeScript.',
        category: 'Learning',
        targetDate: getOffset(30),
        milestones: [
          { id: 'm-2-1', title: 'Read Lamport paper on Logical Clocks', completed: true },
          { id: 'm-2-2', title: 'Implement leader election state machine', completed: true },
          { id: 'm-2-3', title: 'Implement log replication & compaction', completed: false },
        ],
      },
      {
        id: 'g-3',
        title: 'Annual Architectural Whitepaper',
        description: 'Publish guide on responsive local-first React systems.',
        category: 'Creative',
        targetDate: overdueStr,
        milestones: [
          { id: 'm-3-1', title: 'Outline core benchmarks and criteria', completed: true },
          { id: 'm-3-2', title: 'Collect case study telemetry', completed: false },
        ],
      },
    ],
    focusSessions: [
      {
        id: 'fs-1',
        startTime: `${todayStr}T09:00:00Z`,
        endTime: `${todayStr}T09:25:00Z`,
        durationMinutes: 25,
        taskTitle: 'Review pull requests & merge core features',
        category: 'Work',
        completed: true,
      },
      {
        id: 'fs-2',
        startTime: `${todayStr}T11:45:00Z`,
        endTime: `${todayStr}T12:35:00Z`,
        durationMinutes: 50,
        taskTitle: 'Review infrastructure scalability benchmarks',
        category: 'Work',
        completed: true,
      },
      {
        id: 'fs-3',
        startTime: `${yesterdayStr}T14:00:00Z`,
        endTime: `${yesterdayStr}T14:45:00Z`,
        durationMinutes: 45,
        category: 'Learning',
        completed: true,
      },
    ],
    settings: {
      theme: 'light',
      userName: 'Syed Hadi',
      userTitle: 'Lead Software Architect',
      focusDuration: 25,
      shortBreakDuration: 5,
      longBreakDuration: 15,
      dailyFocusGoalMinutes: 120,
      soundEnabled: true,
    },
  };
}

/* ==========================================================================
   4. CENTRAL REDUCER & ACTIONS
   ========================================================================== */
type Action =
  | { type: 'SET_STATE'; payload: ProductivityState }
  | { type: 'ADD_TASK'; payload: Task }
  | { type: 'UPDATE_TASK'; payload: Task }
  | { type: 'DELETE_TASK'; payload: string }
  | { type: 'TOGGLE_TASK_STATUS'; payload: { id: string; status?: TaskStatus } }
  | { type: 'ADD_HABIT'; payload: Habit }
  | { type: 'UPDATE_HABIT'; payload: Habit }
  | { type: 'DELETE_HABIT'; payload: string }
  | { type: 'TOGGLE_HABIT_DATE'; payload: { id: string; date: string } }
  | { type: 'ADD_EVENT'; payload: CalendarEvent }
  | { type: 'UPDATE_EVENT'; payload: CalendarEvent }
  | { type: 'DELETE_EVENT'; payload: string }
  | { type: 'ADD_GOAL'; payload: Goal }
  | { type: 'UPDATE_GOAL'; payload: Goal }
  | { type: 'DELETE_GOAL'; payload: string }
  | { type: 'TOGGLE_MILESTONE'; payload: { goalId: string; milestoneId: string } }
  | { type: 'ADD_MILESTONE'; payload: { goalId: string; title: string } }
  | { type: 'DELETE_MILESTONE'; payload: { goalId: string; milestoneId: string } }
  | { type: 'ADD_FOCUS_SESSION'; payload: FocusSession }
  | { type: 'DELETE_FOCUS_SESSION'; payload: string }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<AppSettings> }
  | { type: 'UNDO' }
  | { type: 'REDO' };

interface HistoryState {
  past: ProductivityState[];
  present: ProductivityState;
  future: ProductivityState[];
}

function stateReducer(history: HistoryState, action: Action): HistoryState {
  const { past, present, future } = history;

  if (action.type === 'UNDO') {
    if (past.length === 0) return history;
    const previous = past[past.length - 1];
    return {
      past: past.slice(0, past.length - 1),
      present: previous,
      future: [present, ...future],
    };
  }

  if (action.type === 'REDO') {
    if (future.length === 0) return history;
    const next = future[0];
    return {
      past: [...past, present],
      present: next,
      future: future.slice(1),
    };
  }

  if (action.type === 'SET_STATE') {
    return {
      past: [...past.slice(-15), present],
      present: action.payload,
      future: [],
    };
  }

  let newPresent: ProductivityState = { ...present };

  switch (action.type) {
    case 'ADD_TASK':
      newPresent = { ...present, tasks: [action.payload, ...present.tasks] };
      break;
    case 'UPDATE_TASK':
      newPresent = {
        ...present,
        tasks: present.tasks.map((t) => (t.id === action.payload.id ? action.payload : t)),
      };
      break;
    case 'DELETE_TASK':
      newPresent = { ...present, tasks: present.tasks.filter((t) => t.id !== action.payload) };
      break;
    case 'TOGGLE_TASK_STATUS': {
      newPresent = {
        ...present,
        tasks: present.tasks.map((t) => {
          if (t.id !== action.payload.id) return t;
          const nextStatus = action.payload.status || (t.status === 'completed' ? 'todo' : 'completed');
          return {
            ...t,
            status: nextStatus,
            completedAt: nextStatus === 'completed' ? (t.completedAt || new Date().toISOString()) : undefined,
          };
        }),
      };
      break;
    }
    case 'ADD_HABIT':
      newPresent = { ...present, habits: [action.payload, ...present.habits] };
      break;
    case 'UPDATE_HABIT':
      newPresent = {
        ...present,
        habits: present.habits.map((h) => (h.id === action.payload.id ? action.payload : h)),
      };
      break;
    case 'DELETE_HABIT':
      newPresent = { ...present, habits: present.habits.filter((h) => h.id !== action.payload) };
      break;
    case 'TOGGLE_HABIT_DATE': {
      const { id, date } = action.payload;
      newPresent = {
        ...present,
        habits: present.habits.map((h) => {
          if (h.id !== id) return h;
          const exists = h.completedDates.includes(date);
          return {
            ...h,
            completedDates: exists ? h.completedDates.filter((d) => d !== date) : [...h.completedDates, date],
          };
        }),
      };
      break;
    }
    case 'ADD_EVENT':
      newPresent = {
        ...present,
        events: [...present.events, action.payload].sort((a, b) => a.startTime.localeCompare(b.startTime)),
      };
      break;
    case 'UPDATE_EVENT':
      newPresent = {
        ...present,
        events: present.events.map((e) => (e.id === action.payload.id ? action.payload : e)),
      };
      break;
    case 'DELETE_EVENT':
      newPresent = { ...present, events: present.events.filter((e) => e.id !== action.payload) };
      break;
    case 'ADD_GOAL':
      newPresent = { ...present, goals: [action.payload, ...present.goals] };
      break;
    case 'UPDATE_GOAL':
      newPresent = {
        ...present,
        goals: present.goals.map((g) => (g.id === action.payload.id ? action.payload : g)),
      };
      break;
    case 'DELETE_GOAL':
      newPresent = { ...present, goals: present.goals.filter((g) => g.id !== action.payload) };
      break;
    case 'TOGGLE_MILESTONE': {
      const { goalId, milestoneId } = action.payload;
      newPresent = {
        ...present,
        goals: present.goals.map((g) => {
          if (g.id !== goalId) return g;
          return {
            ...g,
            milestones: g.milestones.map((m) =>
              m.id === milestoneId ? { ...m, completed: !m.completed } : m
            ),
          };
        }),
      };
      break;
    }
    case 'ADD_MILESTONE': {
      const { goalId, title } = action.payload;
      const ms: Milestone = { id: `m-${Date.now()}`, title, completed: false };
      newPresent = {
        ...present,
        goals: present.goals.map((g) => (g.id === goalId ? { ...g, milestones: [...g.milestones, ms] } : g)),
      };
      break;
    }
    case 'DELETE_MILESTONE': {
      const { goalId, milestoneId } = action.payload;
      newPresent = {
        ...present,
        goals: present.goals.map((g) =>
          g.id === goalId ? { ...g, milestones: g.milestones.filter((m) => m.id !== milestoneId) } : g
        ),
      };
      break;
    }
    case 'ADD_FOCUS_SESSION':
      newPresent = { ...present, focusSessions: [action.payload, ...present.focusSessions] };
      break;
    case 'DELETE_FOCUS_SESSION':
      newPresent = { ...present, focusSessions: present.focusSessions.filter((s) => s.id !== action.payload) };
      break;
    case 'UPDATE_SETTINGS':
      newPresent = { ...present, settings: { ...present.settings, ...action.payload } };
      break;
    default:
      return history;
  }

  return {
    past: [...past.slice(-15), present],
    present: newPresent,
    future: [],
  };
}

/* ==========================================================================
   5. STANDALONE SUB-VIEWS (HOOK-COMPLIANT)
   ========================================================================== */

// --- A. DASHBOARD VIEW ---
interface DashboardViewProps {
  state: ProductivityState;
  dispatch: React.Dispatch<Action>;
  stats: {
    totalTasks: number;
    completedTasksToday: number;
    pendingTasks: number;
    overdueTasksCount: number;
    scheduledHabitsCount: number;
    habitsCompletedToday: number;
    habitsTodayPct: number;
    overallGoalProgress: number;
    todayFocusMinutes: number;
    focusGoalMinutes: number;
    focusGoalPct: number;
  };
  showToast: (msg: string) => void;
  setCurrentTab: (tab: ViewTab) => void;
}

function DashboardView({ state, dispatch, stats, showToast, setCurrentTab }: DashboardViewProps) {
  const todayStr = getTodayDateString();
  const todayDayOfWeek = new Date().getDay();

  const overdueTasks = state.tasks.filter((t) => isTaskOverdue(t.dueDate, t.status === 'completed'));
  const todayHabits = state.habits.filter((h) => h.scheduledDays.includes(todayDayOfWeek));
  const todayEvents = state.events.filter((e) => e.date === todayStr);

  const past7Days = getRecentDateStrings(7);
  const dayData = past7Days.map((dStr) => {
    const d = parseDate(dStr);
    const tasksDone = state.tasks.filter((t) => t.status === 'completed' && t.completedAt?.startsWith(dStr)).length;
    const focusMins = state.focusSessions
      .filter((s) => s.completed && s.startTime.startsWith(dStr))
      .reduce((sum, s) => sum + s.durationMinutes, 0);
    return {
      dStr,
      dayLabel: d.toLocaleDateString('en-US', { weekday: 'short' }),
      tasksDone,
      focusMins,
    };
  });
  const maxT = Math.max(3, ...dayData.map((d) => d.tasksDone));
  const maxF = Math.max(60, ...dayData.map((d) => d.focusMins));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span>{formatDisplayDate(todayStr)}</span>
            <span>·</span>
            <span>Daily Target: {state.settings.dailyFocusGoalMinutes} mins</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 mt-1">
            Welcome back, {state.settings.userName}
          </h1>
        </div>
        <button
          onClick={() => setCurrentTab('focus')}
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Start Focus Session</span>
        </button>
      </div>

      {overdueTasks.length > 0 && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300 font-medium">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>
              You have <strong>{overdueTasks.length} overdue task(s)</strong> requiring attention!
            </span>
          </div>
          <button
            onClick={() => setCurrentTab('tasks')}
            className="text-red-700 dark:text-red-400 font-semibold hover:underline"
          >
            Review Now →
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => setCurrentTab('tasks')}
          className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl cursor-pointer hover:border-indigo-500 transition-colors"
        >
          <div className="flex items-center justify-between text-neutral-500 mb-2 text-xs">
            <span>Smart Tasks</span>
            <CheckSquare className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-neutral-900 dark:text-neutral-100">
            {stats.completedTasksToday}
            <span className="text-sm font-normal text-neutral-400">/{stats.totalTasks}</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">{stats.pendingTasks} pending tasks</div>
        </div>

        <div
          onClick={() => setCurrentTab('habits')}
          className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl cursor-pointer hover:border-indigo-500 transition-colors"
        >
          <div className="flex items-center justify-between text-neutral-500 mb-2 text-xs">
            <span>Today's Habits</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-neutral-900 dark:text-neutral-100">
            {stats.habitsCompletedToday}
            <span className="text-sm font-normal text-neutral-400">/{stats.scheduledHabitsCount}</span>
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1">
            {stats.habitsTodayPct}% completed today
          </div>
        </div>

        <div
          onClick={() => setCurrentTab('focus')}
          className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl cursor-pointer hover:border-indigo-500 transition-colors"
        >
          <div className="flex items-center justify-between text-neutral-500 mb-2 text-xs">
            <span>Deep Focus</span>
            <Timer className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-neutral-900 dark:text-neutral-100">
            {stats.todayFocusMinutes}
            <span className="text-sm font-normal text-neutral-400">m</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">
            {stats.focusGoalPct}% of {stats.focusGoalMinutes}m target
          </div>
        </div>

        <div
          onClick={() => setCurrentTab('goals')}
          className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl cursor-pointer hover:border-indigo-500 transition-colors"
        >
          <div className="flex items-center justify-between text-neutral-500 mb-2 text-xs">
            <span>Goals & Milestones</span>
            <Target className="w-4 h-4 text-violet-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-neutral-900 dark:text-neutral-100">
            {stats.overallGoalProgress}%
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">{state.goals.length} active goals</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl flex flex-col justify-between">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
            Daily Completion
          </h3>
          <div className="flex items-center justify-center py-4">
            <div className="relative w-36 h-36 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-neutral-100 dark:text-neutral-800"
                  fill="none"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="8"
                  strokeDasharray={251.2}
                  strokeDashoffset={251.2 - (251.2 * stats.habitsTodayPct) / 100}
                  strokeLinecap="round"
                  className="text-indigo-600 transition-all duration-500"
                  fill="none"
                />
              </svg>
              <div className="absolute text-center">
                <div className="text-2xl font-bold font-mono text-neutral-900 dark:text-neutral-100">
                  {stats.habitsTodayPct}%
                </div>
                <div className="text-[10px] uppercase tracking-wider text-neutral-400">Habits</div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-neutral-500 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <span>{stats.habitsCompletedToday} checked in</span>
            <span>{stats.scheduledHabitsCount} scheduled</span>
          </div>
        </div>

        <div className="lg:col-span-2 p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Weekly Productivity
              </h3>
              <p className="text-xs text-neutral-500">Tasks completed vs. Focus minutes (last 7 days)</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-neutral-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-indigo-500" /> Tasks
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" /> Focus (min)
              </span>
            </div>
          </div>

          <div className="h-44 flex items-end gap-3 pt-4 border-b border-neutral-200 dark:border-neutral-800 pb-2">
            {dayData.map((item) => {
              const tHeight = (item.tasksDone / maxT) * 100;
              const fHeight = (item.focusMins / maxF) * 100;
              return (
                <div key={item.dStr} className="flex-1 flex flex-col items-center h-full justify-end group">
                  <div className="w-full flex items-end justify-center gap-1 h-32">
                    <div
                      style={{ height: `${Math.max(4, tHeight)}%` }}
                      className="w-3 bg-indigo-500 hover:bg-indigo-600 rounded-t transition-all"
                      title={`${item.tasksDone} tasks`}
                    />
                    <div
                      style={{ height: `${Math.max(4, fHeight)}%` }}
                      className="w-3 bg-emerald-500 hover:bg-emerald-600 rounded-t transition-all"
                      title={`${item.focusMins} mins`}
                    />
                  </div>
                  <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mt-2">
                    {item.dayLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-indigo-500" /> Today's Schedule
            </h3>
            <button
              onClick={() => setCurrentTab('calendar')}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Calendar →
            </button>
          </div>
          {todayEvents.length === 0 ? (
            <div className="py-6 text-center text-xs text-neutral-400">No scheduled events for today.</div>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
              {todayEvents.map((e) => (
                <div key={e.id} className="py-2 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-neutral-900 dark:text-neutral-100">{e.title}</div>
                    <div className="text-[11px] text-neutral-400 font-mono">
                      {e.startTime} - {e.endTime}
                    </div>
                  </div>
                  <span className="text-neutral-500">{e.category}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-500" /> Daily Habits Check-in
            </h3>
            <button
              onClick={() => setCurrentTab('habits')}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              All Habits →
            </button>
          </div>
          {todayHabits.length === 0 ? (
            <div className="py-6 text-center text-xs text-neutral-400">No habits scheduled for today.</div>
          ) : (
            <div className="space-y-2">
              {todayHabits.map((h) => {
                const done = h.completedDates.includes(todayStr);
                const { currentStreak } = calculateHabitStreaks(h);
                return (
                  <div
                    key={h.id}
                    className="p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-neutral-900 dark:text-neutral-100">{h.title}</div>
                      <div className="text-[11px] text-amber-500 font-mono flex items-center gap-1">
                        <Flame className="w-3 h-3 fill-current" /> {currentStreak}d streak
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        dispatch({ type: 'TOGGLE_HABIT_DATE', payload: { id: h.id, date: todayStr } });
                        showToast('Habit updated');
                      }}
                      className={`p-1 rounded-full ${done ? 'text-emerald-500' : 'text-neutral-400 hover:text-neutral-600'}`}
                    >
                      {done ? <CheckCircle2 className="w-5 h-5 fill-current text-white" /> : <Circle className="w-5 h-5" />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- B. TASKS VIEW ---
interface TasksViewProps {
  state: ProductivityState;
  dispatch: React.Dispatch<Action>;
  showToast: (msg: string) => void;
  openQuickAdd: (type: 'task') => void;
}

function TasksView({ state, dispatch, showToast, openQuickAdd }: TasksViewProps) {
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [searchQ, setSearchQ] = useState('');

  const filtered = state.tasks.filter((t) => {
    if (searchQ && !t.title.toLowerCase().includes(searchQ.toLowerCase())) return false;
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Smart Task Manager
          </h1>
          <p className="text-xs text-neutral-500">List and Kanban views with overdue tracking and priorities.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${viewMode === 'list' ? 'bg-neutral-100 dark:bg-neutral-700 font-semibold' : 'text-neutral-500'}`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${viewMode === 'kanban' ? 'bg-neutral-100 dark:bg-neutral-700 font-semibold' : 'text-neutral-500'}`}
            >
              Kanban
            </button>
          </div>
          <button
            onClick={() => openQuickAdd('task')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Task</span>
          </button>
        </div>
      </div>

      <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-neutral-400" />
          <input
            type="text"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search tasks..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-hidden"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-2.5 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg"
        >
          <option value="all">All Statuses</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="px-2.5 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg"
        >
          <option value="all">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {viewMode === 'list' ? (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl divide-y divide-neutral-100 dark:divide-neutral-800">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-neutral-400">No tasks found.</div>
          ) : (
            filtered.map((t) => {
              const overdue = isTaskOverdue(t.dueDate, t.status === 'completed');
              return (
                <div key={t.id} className="p-3.5 flex items-center justify-between gap-4 text-xs">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <button
                      onClick={() => {
                        dispatch({ type: 'TOGGLE_TASK_STATUS', payload: { id: t.id } });
                        showToast(t.status === 'completed' ? 'Reopened task' : 'Task completed!');
                      }}
                      className="mt-0.5 text-neutral-400 hover:text-indigo-600 shrink-0"
                    >
                      {t.status === 'completed' ? (
                        <CheckCircle2 className="w-4 h-4 fill-emerald-500 text-white" />
                      ) : (
                        <Circle className="w-4 h-4" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <span className={`font-semibold ${t.status === 'completed' ? 'line-through text-neutral-400' : 'text-neutral-900 dark:text-neutral-100'}`}>
                        {t.title}
                      </span>
                      {t.description && <p className="text-[11px] text-neutral-500 truncate mt-0.5">{t.description}</p>}
                      <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-1">
                        <span className={t.priority === 'urgent' ? 'text-red-500 font-semibold' : ''}>
                          {t.priority.toUpperCase()}
                        </span>
                        <span>·</span>
                        <span>{t.category}</span>
                        <span>·</span>
                        <span>{t.estimatedDuration}m</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {overdue ? (
                      <span className="text-[11px] font-semibold text-red-600 font-mono">Overdue ({t.dueDate})</span>
                    ) : (
                      <span className="text-[11px] font-mono text-neutral-400">Due {t.dueDate}</span>
                    )}
                    <button
                      onClick={() => {
                        dispatch({ type: 'DELETE_TASK', payload: t.id });
                        showToast('Task deleted');
                      }}
                      className="p-1 text-neutral-400 hover:text-red-600 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['todo', 'in_progress', 'completed'] as TaskStatus[]).map((col) => {
            const colTasks = filtered.filter((t) => t.status === col);
            return (
              <div key={col} className="p-3 bg-neutral-100 dark:bg-neutral-900/60 rounded-xl border border-neutral-200 dark:border-neutral-800 min-h-[400px]">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-200 dark:border-neutral-800 mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-300">
                  <span>{col.replace('_', ' ')}</span>
                  <span className="font-mono text-neutral-400">{colTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {colTasks.map((t) => (
                    <div key={t.id} className="p-3 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs space-y-1.5 shadow-2xs">
                      <div className="font-semibold text-neutral-900 dark:text-neutral-100">{t.title}</div>
                      <div className="text-[11px] text-neutral-500 flex items-center justify-between">
                        <span>{t.priority}</span>
                        <span className="font-mono">{t.dueDate}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-neutral-100 dark:border-neutral-700">
                        <button
                          onClick={() => {
                            dispatch({ type: 'DELETE_TASK', payload: t.id });
                            showToast('Task removed');
                          }}
                          className="text-neutral-400 hover:text-red-500"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                        <div className="flex gap-1">
                          {col !== 'todo' && (
                            <button
                              onClick={() => {
                                const prev = col === 'completed' ? 'in_progress' : 'todo';
                                dispatch({ type: 'TOGGLE_TASK_STATUS', payload: { id: t.id, status: prev } });
                              }}
                              className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-700 text-[10px]"
                            >
                              ←
                            </button>
                          )}
                          {col !== 'completed' && (
                            <button
                              onClick={() => {
                                const next = col === 'todo' ? 'in_progress' : 'completed';
                                dispatch({ type: 'TOGGLE_TASK_STATUS', payload: { id: t.id, status: next } });
                              }}
                              className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 text-[10px]"
                            >
                              →
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- C. HABITS VIEW ---
interface HabitsViewProps {
  state: ProductivityState;
  dispatch: React.Dispatch<Action>;
  showToast: (msg: string) => void;
  openQuickAdd: (type: 'habit') => void;
  todayStr: string;
}

function HabitsView({ state, dispatch, showToast, openQuickAdd, todayStr }: HabitsViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Habit Tracker & Consistency
          </h1>
          <p className="text-xs text-neutral-500">Scheduled days, rest-day streak calculations, and calendar heatmaps.</p>
        </div>
        <button
          onClick={() => openQuickAdd('habit')}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Habit</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {state.habits.map((h) => {
          const { currentStreak, longestStreak } = calculateHabitStreaks(h);
          const rate = calculateHabitCompletionRate(h, 30);
          const isTodayDone = h.completedDates.includes(todayStr);
          const days42 = getRecentDateStrings(42);

          return (
            <div key={h.id} className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: h.color }} />
                  <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">{h.title}</h3>
                </div>
                <button
                  onClick={() => {
                    dispatch({ type: 'DELETE_HABIT', payload: h.id });
                    showToast('Habit deleted');
                  }}
                  className="text-neutral-400 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs p-2.5 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
                <div>
                  <span className="text-[10px] text-neutral-400">Current Streak</span>
                  <div className="font-bold text-amber-500 font-mono flex items-center justify-center gap-1">
                    <Flame className="w-3.5 h-3.5 fill-current" /> {currentStreak}d
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-400">Longest Streak</span>
                  <div className="font-bold text-neutral-800 dark:text-neutral-200 font-mono">{longestStreak}d</div>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-400">30d Rate</span>
                  <div className="font-bold text-neutral-800 dark:text-neutral-200 font-mono">{rate}%</div>
                </div>
              </div>

              <div>
                <div className="text-[11px] font-medium text-neutral-500 mb-1.5 flex justify-between">
                  <span>6-Week Activity Grid</span>
                  <span>Click cell to toggle</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {days42.map((d) => {
                    const isSched = isHabitScheduledOnDate(h, d);
                    const isDone = h.completedDates.includes(d);
                    const isToday = d === todayStr;

                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          dispatch({ type: 'TOGGLE_HABIT_DATE', payload: { id: h.id, date: d } });
                          showToast(`Updated habit for ${d}`);
                        }}
                        title={`${d}: ${!isSched ? 'Rest day' : isDone ? 'Done' : 'Pending'}`}
                        style={isDone ? { backgroundColor: h.color } : undefined}
                        className={`w-4 h-4 rounded-xs transition-transform hover:scale-125 ${
                          !isSched
                            ? 'bg-neutral-100 dark:bg-neutral-800/40 border border-dashed border-neutral-300 dark:border-neutral-700 opacity-40'
                            : isDone
                            ? 'text-white'
                            : 'bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700'
                        } ${isToday ? 'ring-2 ring-indigo-500' : ''}`}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                <span className="text-xs text-neutral-500">
                  {isTodayDone ? 'Completed for today' : 'Pending today'}
                </span>
                <button
                  onClick={() => {
                    dispatch({ type: 'TOGGLE_HABIT_DATE', payload: { id: h.id, date: todayStr } });
                    showToast('Habit checked');
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                    isTodayDone ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {isTodayDone ? 'Done Today ✓' : 'Mark Done Today'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- D. CALENDAR VIEW ---
interface CalendarViewProps {
  state: ProductivityState;
  dispatch: React.Dispatch<Action>;
  showToast: (msg: string) => void;
  openQuickAdd: (type: 'event') => void;
}

function CalendarView({ state, dispatch, showToast, openQuickAdd }: CalendarViewProps) {
  const [calDate, setCalDate] = useState<Date>(new Date());
  const calDateStr = formatDate(calDate);

  const conflicts = detectEventConflicts(state.events);
  const dayEvents = state.events.filter((e) => e.date === calDateStr);
  const tasksDue = state.tasks.filter((t) => t.dueDate === calDateStr);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Calendar & Planner
          </h1>
          <p className="text-xs text-neutral-500">Schedule timeline with automatic conflict detection.</p>
        </div>
        <button
          onClick={() => openQuickAdd('event')}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Event</span>
        </button>
      </div>

      <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCalDate(new Date())}
            className="px-2.5 py-1 bg-neutral-100 dark:bg-neutral-800 font-medium rounded-md"
          >
            Today
          </button>
          <button
            onClick={() => {
              const next = new Date(calDate);
              next.setDate(next.getDate() - 1);
              setCalDate(next);
            }}
            className="p-1 text-neutral-500 hover:text-neutral-900"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              const next = new Date(calDate);
              next.setDate(next.getDate() + 1);
              setCalDate(next);
            }}
            className="p-1 text-neutral-500 hover:text-neutral-900"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="font-semibold text-sm ml-2">{formatDisplayDate(calDateStr)}</span>
        </div>
        {conflicts.size > 0 && (
          <span className="text-amber-600 font-medium flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Scheduling Conflicts Detected!
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl space-y-3">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Events ({formatDisplayDate(calDateStr)})
          </h3>
          {dayEvents.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-400">No events scheduled on this day.</div>
          ) : (
            <div className="space-y-2">
              {dayEvents.map((ev) => {
                const hasConflict = conflicts.has(ev.id);
                return (
                  <div
                    key={ev.id}
                    className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
                      hasConflict
                        ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300'
                        : 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                        <span>{ev.title}</span>
                        {hasConflict && (
                          <span className="text-[10px] text-amber-700 bg-amber-100 dark:bg-amber-900 px-1.5 py-0.2 rounded font-bold">
                            Conflict: {conflicts.get(ev.id)?.join(', ')}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-500 font-mono mt-0.5">
                        {ev.startTime} - {ev.endTime} {ev.location && `· ${ev.location}`}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        dispatch({ type: 'DELETE_EVENT', payload: ev.id });
                        showToast('Event removed');
                      }}
                      className="text-neutral-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl space-y-3">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-indigo-500" /> Task Deadlines Today
          </h3>
          {tasksDue.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-400">No task deadlines today.</div>
          ) : (
            <div className="space-y-2">
              {tasksDue.map((t) => (
                <div key={t.id} className="p-2 bg-neutral-50 dark:bg-neutral-800 rounded text-xs">
                  <div className="font-semibold text-neutral-900 dark:text-neutral-100">{t.title}</div>
                  <div className="text-[11px] text-neutral-400">
                    {t.priority} · {t.status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- E. FOCUS TIMER VIEW ---
interface FocusTimerViewProps {
  state: ProductivityState;
  dispatch: React.Dispatch<Action>;
  showToast: (msg: string) => void;
}

function FocusTimerView({ state, dispatch, showToast }: FocusTimerViewProps) {
  const [timerStatus, setTimerStatus] = useState<'idle' | 'running' | 'paused'>('idle');
  const [secondsLeft, setSecondsLeft] = useState(state.settings.focusDuration * 60);
  const [timerMode, setTimerMode] = useState<'focus' | 'break'>('focus');
  const [linkedTask, setLinkedTask] = useState('');

  useEffect(() => {
    if (timerStatus !== 'running') return;
    let lastTick = Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      const delta = Math.floor((now - lastTick) / 1000);
      if (delta >= 1) {
        lastTick = now;
        setSecondsLeft((prev) => {
          if (prev - delta <= 0) {
            clearInterval(interval);
            handleFinish();
            return 0;
          }
          return prev - delta;
        });
      }
    }, 500);
    return () => clearInterval(interval);
  }, [timerStatus, timerMode]);

  const handleFinish = () => {
    setTimerStatus('idle');
    if (state.settings.soundEnabled) playChime('complete');

    if (timerMode === 'focus') {
      try {
        confetti({ particleCount: 60, spread: 70 });
      } catch (e) {}

      const mins = state.settings.focusDuration;
      dispatch({
        type: 'ADD_FOCUS_SESSION',
        payload: {
          id: `fs-${Date.now()}`,
          startTime: new Date(Date.now() - mins * 60000).toISOString(),
          endTime: new Date().toISOString(),
          durationMinutes: mins,
          taskTitle: linkedTask || undefined,
          category: 'Work',
          completed: true,
        },
      });
      showToast(`Completed ${mins}m focus session! Logged to history.`);
      setTimerMode('break');
      setSecondsLeft(state.settings.shortBreakDuration * 60);
    } else {
      showToast('Break finished! Back to focus.');
      setTimerMode('focus');
      setSecondsLeft(state.settings.focusDuration * 60);
    }
  };

  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  const timeFormatted = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  return (
    <div className="space-y-6 max-w-xl mx-auto text-center">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
          Focus Timer (Pomodoro)
        </h1>
        <p className="text-xs text-neutral-500">
          Tab-switch proof timer with audio chime and task history logs.
        </p>
      </div>

      <div className="p-8 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-6 shadow-sm">
        <div className="flex justify-center gap-2">
          <button
            onClick={() => {
              setTimerStatus('idle');
              setTimerMode('focus');
              setSecondsLeft(state.settings.focusDuration * 60);
            }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg ${timerMode === 'focus' ? 'bg-indigo-600 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600'}`}
          >
            Focus ({state.settings.focusDuration}m)
          </button>
          <button
            onClick={() => {
              setTimerStatus('idle');
              setTimerMode('break');
              setSecondsLeft(state.settings.shortBreakDuration * 60);
            }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg ${timerMode === 'break' ? 'bg-emerald-600 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600'}`}
          >
            Break ({state.settings.shortBreakDuration}m)
          </button>
        </div>

        <div className="py-6">
          <div className="font-mono text-6xl font-extrabold text-neutral-900 dark:text-neutral-100 tracking-tight">
            {timeFormatted}
          </div>
          <div className="text-xs text-neutral-400 mt-2 uppercase tracking-widest font-semibold">
            {timerStatus === 'running' ? 'Active' : timerStatus === 'paused' ? 'Paused' : 'Ready'}
          </div>
        </div>

        <div className="flex justify-center gap-4">
          {timerStatus === 'running' ? (
            <button
              onClick={() => {
                if (state.settings.soundEnabled) playChime('pause');
                setTimerStatus('paused');
              }}
              className="px-6 py-2.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-bold rounded-xl"
            >
              Pause
            </button>
          ) : (
            <button
              onClick={() => {
                if (state.settings.soundEnabled) playChime('start');
                setTimerStatus('running');
              }}
              className="px-8 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-xs"
            >
              {timerStatus === 'paused' ? 'Resume' : 'Start Focus'}
            </button>
          )}
          <button
            onClick={() => {
              setTimerStatus('idle');
              setSecondsLeft(
                (timerMode === 'focus' ? state.settings.focusDuration : state.settings.shortBreakDuration) * 60
              );
            }}
            className="p-2.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 rounded-xl"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 text-left">
          <label className="block text-xs font-medium text-neutral-600 mb-1">Link to Task</label>
          <select
            value={linkedTask}
            onChange={(e) => setLinkedTask(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
          >
            <option value="">No linked task</option>
            {state.tasks
              .filter((t) => t.status !== 'completed')
              .map((t) => (
                <option key={t.id} value={t.title}>
                  {t.title}
                </option>
              ))}
          </select>
        </div>
      </div>
    </div>
  );
}

// --- F. GOALS VIEW ---
interface GoalsViewProps {
  state: ProductivityState;
  dispatch: React.Dispatch<Action>;
  showToast: (msg: string) => void;
  openQuickAdd: (type: 'goal') => void;
  todayStr: string;
}

function GoalsView({ state, dispatch, showToast, openQuickAdd, todayStr }: GoalsViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Goals & Milestones
          </h1>
          <p className="text-xs text-neutral-500">Progress automatically computed from completed milestones.</p>
        </div>
        <button
          onClick={() => openQuickAdd('goal')}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Goal</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {state.goals.map((g) => {
          const totalM = g.milestones.length;
          const doneM = g.milestones.filter((m) => m.completed).length;
          const progress = totalM > 0 ? Math.round((doneM / totalM) * 100) : 0;
          const isOverdue = new Date(g.targetDate) < new Date(todayStr) && progress < 100;

          return (
            <div key={g.id} className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">{g.title}</h3>
                  {g.description && <p className="text-xs text-neutral-500 mt-0.5">{g.description}</p>}
                  <div className="text-[11px] text-neutral-400 mt-1 flex items-center gap-2">
                    <span>{g.category}</span>
                    <span>·</span>
                    <span>Target: {g.targetDate}</span>
                    {isOverdue && <span className="text-red-500 font-bold">Overdue!</span>}
                  </div>
                </div>
                <button
                  onClick={() => {
                    dispatch({ type: 'DELETE_GOAL', payload: g.id });
                    showToast('Goal deleted');
                  }}
                  className="text-neutral-400 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-neutral-600">Milestone Progress</span>
                  <span className="font-mono font-bold text-indigo-600">
                    {doneM}/{totalM} ({progress}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${progress === 100 ? 'bg-emerald-500' : 'bg-indigo-600'}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                {g.milestones.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-xs p-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 rounded">
                    <button
                      onClick={() => {
                        dispatch({ type: 'TOGGLE_MILESTONE', payload: { goalId: g.id, milestoneId: m.id } });
                        if (!m.completed && doneM + 1 === totalM) {
                          try {
                            confetti({ particleCount: 70, spread: 80 });
                          } catch (e) {}
                          showToast(`🎉 Goal achieved!`);
                        } else {
                          showToast('Milestone updated');
                        }
                      }}
                      className="flex items-center gap-2 text-left flex-1"
                    >
                      {m.completed ? (
                        <CheckCircle2 className="w-4 h-4 fill-emerald-500 text-white shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-neutral-400 shrink-0" />
                      )}
                      <span className={m.completed ? 'line-through text-neutral-400' : 'text-neutral-800 dark:text-neutral-200'}>
                        {m.title}
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        dispatch({ type: 'DELETE_MILESTONE', payload: { goalId: g.id, milestoneId: m.id } });
                        showToast('Milestone removed');
                      }}
                      className="text-neutral-400 hover:text-red-500 p-0.5"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- G. ANALYTICS VIEW ---
function AnalyticsView({ state }: { state: ProductivityState }) {
  const totalDone = state.tasks.filter((t) => t.status === 'completed').length;
  const totalFocus = state.focusSessions.reduce((acc, s) => acc + s.durationMinutes, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
          Productivity Analytics
        </h1>
        <p className="text-xs text-neutral-500">Historical performance metrics calculated from real user actions.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl">
          <div className="text-xs text-neutral-500 mb-1">Lifetime Tasks Done</div>
          <div className="text-2xl font-bold font-mono">{totalDone}</div>
        </div>
        <div className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl">
          <div className="text-xs text-neutral-500 mb-1">Total Focus Logged</div>
          <div className="text-2xl font-bold font-mono">{totalFocus}m</div>
        </div>
        <div className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl">
          <div className="text-xs text-neutral-500 mb-1">Active Habits</div>
          <div className="text-2xl font-bold font-mono">{state.habits.length}</div>
        </div>
      </div>
    </div>
  );
}

// --- H. SETTINGS VIEW ---
interface SettingsViewProps {
  state: ProductivityState;
  dispatch: React.Dispatch<Action>;
  showToast: (msg: string) => void;
}

function SettingsView({ state, dispatch, showToast }: SettingsViewProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Settings</h1>
        <p className="text-xs text-neutral-500">Preferences, appearances, and JSON backup & restore.</p>
      </div>

      <div className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl space-y-4 text-xs">
        <div className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">Appearance & Theme</div>
        <div className="flex gap-2">
          {(['light', 'dark', 'system'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => {
                dispatch({ type: 'UPDATE_SETTINGS', payload: { theme: mode } });
                showToast(`Theme set to ${mode}`);
              }}
              className={`px-4 py-2 rounded-lg capitalize font-medium border ${
                state.settings.theme === mode
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 space-y-3">
          <div className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">Data Management</div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
                const a = document.createElement('a');
                a.href = dataStr;
                a.download = `lifeos_backup_${getTodayDateString()}.json`;
                a.click();
                showToast('Backup downloaded');
              }}
              className="px-3.5 py-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg font-medium flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Export Backup
            </button>
            <label className="px-3.5 py-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg font-medium flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5" /> Import Backup
              <input
                ref={fileRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const r = new FileReader();
                  r.onload = (ev) => {
                    try {
                      const parsed = JSON.parse(ev.target?.result as string);
                      if (parsed.tasks && parsed.habits) {
                        dispatch({ type: 'SET_STATE', payload: parsed });
                        showToast('Restored backup successfully');
                      } else {
                        showToast('Invalid backup file');
                      }
                    } catch (err) {
                      showToast('Malformed JSON');
                    }
                  };
                  r.readAsText(f);
                }}
              />
            </label>
            <button
              onClick={() => {
                dispatch({ type: 'SET_STATE', payload: generateInitialData() });
                showToast('Reset to default sample data');
              }}
              className="px-3.5 py-2 bg-neutral-100 dark:bg-neutral-800 text-amber-600 rounded-lg font-medium"
            >
              Reset Sample Data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   6. ROOT APP COMPONENT
   ========================================================================== */
export default function App() {
  const [history, dispatch] = useReducer(stateReducer, null, () => {
    try {
      const saved = localStorage.getItem('lifeos_master_data');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.tasks) && Array.isArray(parsed.habits)) {
          return { past: [], present: parsed, future: [] };
        }
      }
    } catch (e) {}
    return { past: [], present: generateInitialData(), future: [] };
  });

  const state = history.present;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const [currentTab, setCurrentTab] = useState<ViewTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddType, setQuickAddType] = useState<'task' | 'habit' | 'event' | 'goal'>('task');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('lifeos_master_data', JSON.stringify(state));
    } catch (e) {}
  }, [state]);

  useEffect(() => {
    const root = document.documentElement;
    if (state.settings.theme === 'dark') {
      root.classList.add('dark');
    } else if (state.settings.theme === 'light') {
      root.classList.remove('dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) root.classList.add('dark');
      else root.classList.remove('dark');
    }
  }, [state.settings.theme]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };
  useEffect(() => {
    if (toastMessage) {
      const t = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toastMessage]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) {
            dispatch({ type: 'REDO' });
            showToast('Redid action');
          }
        } else {
          if (canUndo) {
            dispatch({ type: 'UNDO' });
            showToast('Undid last action');
          }
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault();
        if (canRedo) {
          dispatch({ type: 'REDO' });
          showToast('Redid action');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canUndo, canRedo]);

  const todayStr = getTodayDateString();
  const todayDayOfWeek = new Date().getDay();

  const stats = useMemo(() => {
    const totalTasks = state.tasks.length;
    const completedTasksToday = state.tasks.filter(
      (t) => t.status === 'completed' && t.completedAt && t.completedAt.startsWith(todayStr)
    ).length;
    const pendingTasks = state.tasks.filter((t) => t.status !== 'completed').length;
    const overdueTasksCount = state.tasks.filter((t) => isTaskOverdue(t.dueDate, t.status === 'completed')).length;

    const scheduledHabitsToday = state.habits.filter((h) => h.scheduledDays.includes(todayDayOfWeek));
    const habitsCompletedToday = scheduledHabitsToday.filter((h) => h.completedDates.includes(todayStr)).length;
    const habitsTodayPct =
      scheduledHabitsToday.length > 0 ? Math.round((habitsCompletedToday / scheduledHabitsToday.length) * 100) : 100;

    let totalMilestones = 0;
    let completedMilestones = 0;
    state.goals.forEach((g) => {
      totalMilestones += g.milestones.length;
      completedMilestones += g.milestones.filter((m) => m.completed).length;
    });
    const overallGoalProgress = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

    const todayFocusMinutes = state.focusSessions
      .filter((s) => s.completed && s.startTime.startsWith(todayStr))
      .reduce((sum, s) => sum + s.durationMinutes, 0);

    const focusGoalMinutes = state.settings.dailyFocusGoalMinutes || 120;
    const focusGoalPct = Math.min(100, Math.round((todayFocusMinutes / focusGoalMinutes) * 100));

    return {
      totalTasks,
      completedTasksToday,
      pendingTasks,
      overdueTasksCount,
      scheduledHabitsCount: scheduledHabitsToday.length,
      habitsCompletedToday,
      habitsTodayPct,
      overallGoalProgress,
      todayFocusMinutes,
      focusGoalMinutes,
      focusGoalPct,
    };
  }, [state, todayStr, todayDayOfWeek]);

  const openQuickAdd = (type: 'task' | 'habit' | 'event' | 'goal' = 'task') => {
    setQuickAddType(type);
    setQuickAddOpen(true);
  };

  const navItems: { id: ViewTab; label: string; icon: React.ElementType; badge?: string | number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    {
      id: 'tasks',
      label: 'Tasks',
      icon: CheckSquare,
      badge: stats.overdueTasksCount > 0 ? `${stats.overdueTasksCount} overdue` : stats.pendingTasks,
    },
    { id: 'habits', label: 'Habits', icon: Flame, badge: `${stats.habitsCompletedToday}/${stats.scheduledHabitsCount}` },
    { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
    { id: 'focus', label: 'Focus Timer', icon: Timer, badge: `${stats.todayFocusMinutes}m` },
    { id: 'goals', label: 'Goals', icon: Target, badge: `${stats.overallGoalProgress}%` },
    { id: 'analytics', label: 'Analytics', icon: BarChart2 },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-1 text-neutral-600">
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <span className="font-bold text-base tracking-tight">LifeOS</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openQuickAdd('task')}
            className="p-1.5 bg-indigo-600 text-white rounded-lg"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Sidebar (Desktop 260px) */}
      <aside
        className={`fixed md:sticky top-0 h-screen z-40 w-64 shrink-0 flex flex-col justify-between border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 transition-transform ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-4 flex flex-col h-full">
          <div className="flex items-center gap-2.5 pb-4 border-b border-neutral-100 dark:border-neutral-800 mb-4">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-base shadow-xs">
              L
            </div>
            <div>
              <div className="font-bold text-base leading-tight">LifeOS</div>
              <div className="text-[11px] text-neutral-400">Your life. In focus.</div>
            </div>
          </div>

          <button
            onClick={() => openQuickAdd('task')}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 mb-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create New Record</span>
          </button>

          <nav className="flex-1 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    active
                      ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                      : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-neutral-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-neutral-100 dark:bg-neutral-800">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
              {state.settings.userName}
            </div>
            <button
              onClick={() => {
                const next = state.settings.theme === 'dark' ? 'light' : 'dark';
                dispatch({ type: 'UPDATE_SETTINGS', payload: { theme: next } });
              }}
              className="p-1.5 text-neutral-500 hover:text-neutral-900 rounded-md"
            >
              {state.settings.theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main View Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="hidden md:flex items-center justify-between px-8 py-3.5 border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md sticky top-0 z-20">
          <div className="text-xs text-neutral-500">
            <span className="font-semibold text-neutral-900 dark:text-neutral-100 capitalize">{currentTab}</span>
            <span> / LifeOS Personal Workspace</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 rounded-lg p-0.5">
              <button
                onClick={() => {
                  dispatch({ type: 'UNDO' });
                  showToast('Undid action');
                }}
                disabled={!canUndo}
                className="p-1.5 text-neutral-600 dark:text-neutral-300 disabled:opacity-30"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  dispatch({ type: 'REDO' });
                  showToast('Redid action');
                }}
                disabled={!canRedo}
                className="p-1.5 text-neutral-600 dark:text-neutral-300 disabled:opacity-30"
                title="Redo (Ctrl+Y)"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-500 bg-neutral-100 dark:bg-neutral-800 rounded-lg"
            >
              <Search className="w-3.5 h-3.5" /> Search (⌘K)
            </button>
            <button
              onClick={() => openQuickAdd('task')}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
            >
              + New Record
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
          {currentTab === 'dashboard' && (
            <DashboardView
              state={state}
              dispatch={dispatch}
              stats={stats}
              showToast={showToast}
              setCurrentTab={setCurrentTab}
            />
          )}
          {currentTab === 'tasks' && (
            <TasksView
              state={state}
              dispatch={dispatch}
              showToast={showToast}
              openQuickAdd={openQuickAdd}
            />
          )}
          {currentTab === 'habits' && (
            <HabitsView
              state={state}
              dispatch={dispatch}
              showToast={showToast}
              openQuickAdd={openQuickAdd}
              todayStr={todayStr}
            />
          )}
          {currentTab === 'calendar' && (
            <CalendarView
              state={state}
              dispatch={dispatch}
              showToast={showToast}
              openQuickAdd={openQuickAdd}
            />
          )}
          {currentTab === 'focus' && (
            <FocusTimerView
              state={state}
              dispatch={dispatch}
              showToast={showToast}
            />
          )}
          {currentTab === 'goals' && (
            <GoalsView
              state={state}
              dispatch={dispatch}
              showToast={showToast}
              openQuickAdd={openQuickAdd}
              todayStr={todayStr}
            />
          )}
          {currentTab === 'analytics' && <AnalyticsView state={state} />}
          {currentTab === 'settings' && (
            <SettingsView
              state={state}
              dispatch={dispatch}
              showToast={showToast}
            />
          )}
        </main>
      </div>

      {/* Quick Add Modal */}
      {quickAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-neutral-800 mb-4">
              <span className="font-semibold text-sm">Add New {quickAddType.toUpperCase()}</span>
              <button onClick={() => setQuickAddOpen(false)} className="text-neutral-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const title = (form.elements.namedItem('title') as HTMLInputElement).value;
                if (!title.trim()) return;

                if (quickAddType === 'task') {
                  const newTask: Task = {
                    id: `t-${Date.now()}`,
                    title: title.trim(),
                    priority: 'medium',
                    status: 'todo',
                    dueDate: getTodayDateString(),
                    category: 'Work',
                    estimatedDuration: 30,
                  };
                  dispatch({ type: 'ADD_TASK', payload: newTask });
                  showToast('Task created');
                } else if (quickAddType === 'habit') {
                  const newHabit: Habit = {
                    id: `h-${Date.now()}`,
                    title: title.trim(),
                    category: 'Health',
                    frequency: 'daily',
                    scheduledDays: [0, 1, 2, 3, 4, 5, 6],
                    color: '#6366f1',
                    completedDates: [],
                  };
                  dispatch({ type: 'ADD_HABIT', payload: newHabit });
                  showToast('Habit created');
                } else if (quickAddType === 'event') {
                  const newEvent: CalendarEvent = {
                    id: `e-${Date.now()}`,
                    title: title.trim(),
                    date: getTodayDateString(),
                    startTime: '10:00',
                    endTime: '11:00',
                    category: 'Work',
                  };
                  dispatch({ type: 'ADD_EVENT', payload: newEvent });
                  showToast('Event created');
                } else if (quickAddType === 'goal') {
                  const newGoal: Goal = {
                    id: `g-${Date.now()}`,
                    title: title.trim(),
                    category: 'Work',
                    targetDate: getTodayDateString(),
                    milestones: [{ id: `m-${Date.now()}`, title: 'First Milestone', completed: false }],
                  };
                  dispatch({ type: 'ADD_GOAL', payload: newGoal });
                  showToast('Goal created');
                }

                setQuickAddOpen(false);
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block text-neutral-600 mb-1 font-medium">Title</label>
                <input
                  name="title"
                  type="text"
                  required
                  placeholder={`Enter ${quickAddType} name...`}
                  className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setQuickAddOpen(false)}
                  className="px-3 py-1.5 text-neutral-600"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-1.5 bg-indigo-600 text-white font-semibold rounded-lg">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Command Palette */}
      {commandPaletteOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl max-w-lg w-full shadow-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-neutral-100 dark:border-neutral-800">
              <Search className="w-4 h-4 text-neutral-400" />
              <input
                type="text"
                autoFocus
                placeholder="Jump to: Dashboard, Tasks, Habits, Calendar, Focus, Goals..."
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setCommandPaletteOpen(false);
                }}
                className="flex-1 text-xs bg-transparent focus:outline-hidden"
              />
              <button onClick={() => setCommandPaletteOpen(false)}>
                <X className="w-4 h-4 text-neutral-400" />
              </button>
            </div>
            <div className="space-y-1 text-xs">
              {navItems.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    setCurrentTab(n.id);
                    setCommandPaletteOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left"
                >
                  <span>Go to {n.label}</span>
                  <ArrowRight className="w-3 h-3 text-neutral-400" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Global Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-lg text-xs font-semibold shadow-xl">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
