import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMemo, useRef, useState } from "react";
import { api, type ApiResponse } from "./api";
import backgroundImage from "./assets/landscape-ribbon-background.jpg";

type Kind = "expense" | "income";
type Category = "food" | "transport" | "shopping" | "home" | "health" | "entertainment" | "income" | "other";
type Transaction = ApiResponse<typeof api, "listTransactions">["transactions"][number];
type OvertimeEntry = ApiResponse<typeof api, "listOvertimeEntries">["entries"][number];
type Tab = "ledger" | "overtime";
type CompensationType = "pay" | "time_off";
type OvertimeStatus = "pending" | "settled";
type DurationMode = "clock" | "manual";

type SpeechEventLike = { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> };
type SpeechErrorLike = { error: string };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechEventLike) => void) | null;
  onerror: ((event: SpeechErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

const categories: Array<{ value: Category; label: string; mark: string; color: string }> = [
  { value: "food", label: "餐饮", mark: "餐", color: "#c75d36" },
  { value: "transport", label: "交通", mark: "行", color: "#39768c" },
  { value: "shopping", label: "购物", mark: "购", color: "#9a594f" },
  { value: "home", label: "居家", mark: "家", color: "#597e52" },
  { value: "health", label: "医疗", mark: "健", color: "#a34858" },
  { value: "entertainment", label: "娱乐", mark: "乐", color: "#8b6b45" },
  { value: "income", label: "收入", mark: "收", color: "#447a5b" },
  { value: "other", label: "其他", mark: "其", color: "#6a7180" },
];

function categoryInfo(value: string) {
  return categories.find((item) => item.value === value) ?? categories[7]!;
}

function yuan(cents: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localMonthKey(date = new Date()) {
  return localDateKey(date).slice(0, 7);
}

function monthLabel(month: string) {
  const [year = "", value = ""] = month.split("-");
  return `${year}年${Number(value)}月`;
}

function shiftMonth(month: string, delta: number) {
  const [yearValue = "1970", monthValue = "1"] = month.split("-");
  const date = new Date(Number(yearValue), Number(monthValue) - 1 + delta, 1);
  return localMonthKey(date);
}

function shortDate(date: string) {
  const [, month = "", day = ""] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}分钟`;
  return rest === 0 ? `${hours}小时` : `${hours}小时${rest}分`;
}

function minutesBetween(start: string, end: string, breakMinutes: number) {
  const [startHour = 0, startMinute = 0] = start.split(":").map(Number);
  const [endHour = 0, endMinute = 0] = end.split(":").map(Number);
  let total = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (total <= 0) total += 24 * 60;
  return Math.max(0, total - breakMinutes);
}

function MicIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8"/></svg>;
}

function PlusIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>;
}

export function App() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("ledger");
  const [selectedMonth, setSelectedMonth] = useState(localMonthKey());
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Category>("other");
  const [note, setNote] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetAmount, setBudgetAmount] = useState("");
  const [overtimeOpen, setOvertimeOpen] = useState(false);
  const [editingOvertimeId, setEditingOvertimeId] = useState<number | null>(null);
  const [workDate, setWorkDate] = useState(localDateKey());
  const [durationMode, setDurationMode] = useState<DurationMode>("clock");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("20:00");
  const [breakMinutes, setBreakMinutes] = useState("0");
  const [workHours, setWorkHours] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [multiplier, setMultiplier] = useState("1.5");
  const [compensationType, setCompensationType] = useState<CompensationType>("pay");
  const [overtimeStatus, setOvertimeStatus] = useState<OvertimeStatus>("pending");
  const [workNote, setWorkNote] = useState("");
  const [deleteOvertimeId, setDeleteOvertimeId] = useState<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const records = useQuery({
    queryKey: ["transactions"],
    queryFn: () => api.listTransactions({ limit: 300 }),
  });
  const budgets = useQuery({
    queryKey: ["monthly-budgets"],
    queryFn: () => api.listMonthlyBudgets({}),
  });
  const overtime = useQuery({
    queryKey: ["overtime"],
    queryFn: () => api.listOvertimeEntries({ limit: 300 }),
  });

  const parseVoice = useMutation({
    mutationFn: (text: string) => api.parseVoiceEntry({ transcript: text }),
    onSuccess: (parsed) => {
      setKind(parsed.kind);
      setAmount(parsed.amount == null ? "" : String(parsed.amount));
      setCategory(parsed.kind === "income" ? "income" : parsed.category === "income" ? "other" : parsed.category);
      setNote(parsed.note);
      setReviewOpen(true);
    },
  });

  const addTransaction = useMutation({
    mutationFn: () => api.addTransaction({
      kind,
      amount_cents: Math.round(Number(amount) * 100),
      category,
      note,
      spoken_text: transcript.trim() || null,
      occurred_at: new Date().toISOString(),
    }),
    onSuccess: async () => {
      setReviewOpen(false);
      setTranscript("");
      setInterim("");
      setAmount("");
      setNote("");
      setSelectedMonth(localMonthKey());
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  const deleteTransaction = useMutation({
    mutationFn: (id: number) => api.deleteTransaction({ id }),
    onSuccess: async () => {
      setDeleteId(null);
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  const setBudget = useMutation({
    mutationFn: () => api.setMonthlyBudget({ year_month: selectedMonth, total_cents: Math.round(Number(budgetAmount) * 100) }),
    onSuccess: async () => {
      setBudgetOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["monthly-budgets"] });
    },
  });

  const saveOvertime = useMutation({
    mutationFn: async () => {
      const payload = overtimePayload();
      if (editingOvertimeId == null) return api.addOvertimeEntry(payload);
      const result = await api.updateOvertimeEntry({ id: editingOvertimeId, ...payload });
      return { id: editingOvertimeId, pay_cents: result.pay_cents };
    },
    onSuccess: async () => {
      setOvertimeOpen(false);
      setEditingOvertimeId(null);
      setWorkHours("");
      setWorkNote("");
      setSelectedMonth(workDate.slice(0, 7));
      await queryClient.invalidateQueries({ queryKey: ["overtime"] });
    },
  });

  const changeOvertimeStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: OvertimeStatus }) => api.setOvertimeStatus({ id, status }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["overtime"] }),
  });

  const deleteOvertime = useMutation({
    mutationFn: (id: number) => api.deleteOvertimeEntry({ id }),
    onSuccess: async () => {
      setDeleteOvertimeId(null);
      await queryClient.invalidateQueries({ queryKey: ["overtime"] });
    },
  });

  const monthRows = useMemo(() => (records.data?.transactions ?? []).filter((row) => localMonthKey(new Date(row.occurred_at)) === selectedMonth), [records.data, selectedMonth]);
  const summary = useMemo(() => monthRows.reduce((acc, row) => {
    if (row.kind === "expense") acc.expense += row.amount_cents;
    else acc.income += row.amount_cents;
    return acc;
  }, { expense: 0, income: 0 }), [monthRows]);
  const currentBudget = budgets.data?.budgets.find((item) => item.year_month === selectedMonth)?.total_cents ?? null;
  const remaining = currentBudget == null ? null : currentBudget - summary.expense;
  const categoryData = useMemo(() => categories
    .filter((item) => item.value !== "income")
    .map((item) => ({
      name: item.label,
      value: monthRows.filter((row) => row.kind === "expense" && row.category === item.value).reduce((sum, row) => sum + row.amount_cents, 0) / 100,
      fill: item.color,
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value), [monthRows]);

  const monthOvertime = useMemo(() => (overtime.data?.entries ?? []).filter((entry) => entry.work_date.slice(0, 7) === selectedMonth), [overtime.data, selectedMonth]);
  const overtimeSummary = useMemo(() => monthOvertime.reduce((acc, entry) => ({
    minutes: acc.minutes + entry.minutes,
    pendingPay: acc.pendingPay + (entry.compensation_type === "pay" && entry.status === "pending" ? entry.pay_cents : 0),
    settledPay: acc.settledPay + (entry.compensation_type === "pay" && entry.status === "settled" ? entry.pay_cents : 0),
    pendingTimeOff: acc.pendingTimeOff + (entry.compensation_type === "time_off" && entry.status === "pending" ? entry.minutes : 0),
    pendingCount: acc.pendingCount + (entry.status === "pending" ? 1 : 0),
  }), { minutes: 0, pendingPay: 0, settledPay: 0, pendingTimeOff: 0, pendingCount: 0 }), [monthOvertime]);

  function startListening() {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setSpeechError("当前浏览器不支持语音识别，请在下方输入一句话。");
      return;
    }
    setSpeechError("");
    setTranscript("");
    setInterim("");
    const recognition = new Ctor();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result?.[0]?.transcript ?? "";
        if (result?.isFinal) finalText += text;
        else interimText += text;
      }
      if (finalText) setTranscript((current) => `${current}${finalText}`.trim());
      setInterim(interimText);
    };
    recognition.onerror = (event) => {
      setSpeechError(event.error === "not-allowed" ? "需要麦克风权限才能听写。你也可以在下方输入。" : "没有听清，再说一次试试。");
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      setInterim("");
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  function openBudget() {
    setBudgetAmount(currentBudget == null ? "" : String(currentBudget / 100));
    setBudgetOpen(true);
  }

  function openOvertimeForm(presetNote = "", presetMultiplier = "1.5") {
    setEditingOvertimeId(null);
    setWorkDate(selectedMonth === localMonthKey() ? localDateKey() : `${selectedMonth}-01`);
    setDurationMode("clock");
    setStartTime("18:00");
    setEndTime("20:00");
    setBreakMinutes("0");
    setWorkHours("");
    setWorkNote(presetNote);
    setMultiplier(presetMultiplier);
    setCompensationType("pay");
    setOvertimeStatus("pending");
    setOvertimeOpen(true);
  }

  function editOvertime(entry: OvertimeEntry) {
    setEditingOvertimeId(entry.id);
    setWorkDate(entry.work_date);
    setDurationMode(entry.start_time && entry.end_time ? "clock" : "manual");
    setStartTime(entry.start_time ?? "18:00");
    setEndTime(entry.end_time ?? "20:00");
    setBreakMinutes(String(entry.break_minutes));
    setWorkHours(String(entry.minutes / 60));
    setHourlyRate(entry.hourly_rate_cents === 0 ? "" : String(entry.hourly_rate_cents / 100));
    setMultiplier(String(entry.multiplier_hundredths / 100));
    setCompensationType(entry.compensation_type);
    setOvertimeStatus(entry.status);
    setWorkNote(entry.note);
    setOvertimeOpen(true);
  }

  const calculatedMinutes = durationMode === "clock"
    ? minutesBetween(startTime, endTime, Math.max(0, Number(breakMinutes) || 0))
    : Math.round(Number(workHours) * 60);

  function overtimePayload() {
    return {
      work_date: workDate,
      minutes: calculatedMinutes,
      hourly_rate_cents: Math.round(Number(hourlyRate || 0) * 100),
      multiplier_hundredths: Math.round(Number(multiplier) * 100),
      note: workNote,
      start_time: durationMode === "clock" ? startTime : null,
      end_time: durationMode === "clock" ? endTime : null,
      break_minutes: durationMode === "clock" ? Math.round(Number(breakMinutes) || 0) : 0,
      compensation_type: compensationType,
      status: overtimeStatus,
    };
  }

  const amountValid = Number(amount) > 0 && Number.isFinite(Number(amount));
  const budgetValid = Number(budgetAmount) > 0 && Number.isFinite(Number(budgetAmount));
  const overtimeValid = calculatedMinutes > 0 && calculatedMinutes <= 1440 && Number(hourlyRate || 0) >= 0 && Number(multiplier) >= 1 && Number(multiplier) <= 3;
  const projectedPay = overtimeValid && compensationType === "pay" ? Math.round((calculatedMinutes / 60) * Number(hourlyRate || 0) * Number(multiplier) * 100) : 0;

  return (
    <div className="app-background min-h-screen" style={{ backgroundImage: `url(${backgroundImage})` }}>
      <SafeAreaTopScrim backgroundColor="rgba(8, 31, 62, .72)" />
      <main className="relative z-10 mx-auto w-full max-w-3xl px-4 pb-[calc(env(safe-area-inset-bottom)+96px)] md:px-8">
        <section className="pt-4 md:pt-7">
          <div className="glass-strip flex items-center justify-between p-1.5" aria-label="功能切换">
            <button type="button" onClick={() => setTab("ledger")} className={`flex-1 rounded-[13px] py-2.5 text-sm font-bold transition ${tab === "ledger" ? "bg-[var(--surface-strong)] text-[var(--text)] shadow-sm" : "text-[var(--dim)]"}`}>月度管账</button>
            <button type="button" onClick={() => setTab("overtime")} className={`flex-1 rounded-[13px] py-2.5 text-sm font-bold transition ${tab === "overtime" ? "bg-[var(--surface-strong)] text-[var(--text)] shadow-sm" : "text-[var(--dim)]"}`}>加班记录</button>
          </div>
          <div className="mt-3 flex items-center justify-center gap-4 text-[var(--text-on-image)]">
            <button type="button" aria-label="查看上个月" onClick={() => setSelectedMonth((value) => shiftMonth(value, -1))} className="glass-control h-9 w-9 rounded-full text-lg">‹</button>
            <p className="min-w-28 text-center text-sm font-bold drop-shadow">{monthLabel(selectedMonth)}</p>
            <button type="button" aria-label="查看下个月" onClick={() => setSelectedMonth((value) => shiftMonth(value, 1))} className="glass-control h-9 w-9 rounded-full text-lg">›</button>
          </div>
        </section>

        {tab === "ledger" ? (
          <>
            <section className="glass-panel mt-3 overflow-hidden" aria-label={`${monthLabel(selectedMonth)}资金总览`}>
              <div className="flex items-start justify-between gap-3 px-5 pt-5">
                <div>
                  <p className="text-sm text-[var(--dim)]">本月已支出</p>
                  <p className="amount-font mt-1 text-4xl font-bold tracking-tight">{yuan(summary.expense)}</p>
                </div>
                <button type="button" onClick={openBudget} className="rounded-[12px] bg-[var(--accent)] px-3 py-2 text-xs font-bold text-[var(--accent-ink)]">{currentBudget == null ? "输入总额" : "修改总额"}</button>
              </div>
              <div className="mt-5 grid grid-cols-2 border-t border-[var(--border)]">
                <div className="border-r border-[var(--border)] px-5 py-4">
                  <p className="text-xs text-[var(--dim)]">月度总额</p>
                  <p className="amount-font mt-0.5 text-lg font-bold">{currentBudget == null ? "未设置" : yuan(currentBudget)}</p>
                </div>
                <div className="px-5 py-4">
                  <p className="text-xs text-[var(--dim)]">{remaining != null && remaining < 0 ? "已超出" : "还可支配"}</p>
                  <p className={`amount-font mt-0.5 text-lg font-bold ${remaining != null && remaining < 0 ? "text-[var(--danger)]" : "text-[var(--accent)]"}`}>{remaining == null ? "—" : yuan(Math.abs(remaining))}</p>
                </div>
              </div>
              {currentBudget != null && (
                <div className="px-5 pb-5">
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--soft)]" aria-label={`本月总额已使用${Math.round(summary.expense / currentBudget * 100)}%`}>
                    <div className={`h-full rounded-full ${summary.expense > currentBudget ? "bg-[var(--danger)]" : "bg-[var(--accent)]"}`} style={{ width: `${Math.min(100, summary.expense / currentBudget * 100)}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-[var(--dim)]">收入 {yuan(summary.income)} · 总额使用 {Math.round(summary.expense / currentBudget * 100)}%</p>
                </div>
              )}
            </section>

            <section className="glass-panel mt-4 px-4 py-5" aria-labelledby="where-heading">
              <div className="flex items-end justify-between gap-3">
                <div><h2 id="where-heading" className="text-lg font-bold">钱花去哪了</h2><p className="mt-0.5 text-xs text-[var(--dim)]">按本月分类汇总</p></div>
                <p className="text-xs font-semibold text-[var(--dim)]">{monthRows.filter((row) => row.kind === "expense").length} 笔支出</p>
              </div>
              {categoryData.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--dim)]">本月还没有支出记录</p>
              ) : (
                <div className="mt-4 h-[220px] w-full" aria-label="本月支出分类图表">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 14, bottom: 0, left: 0 }} accessibilityLayer>
                      <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
                      <XAxis type="number" domain={[0, "auto"]} tickFormatter={(value: number) => `¥${value}`} tick={{ fill: "var(--dim)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={42} tick={{ fill: "var(--text)", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value: number) => yuan(Math.round(value * 100))} contentStyle={{ background: "var(--surface-solid)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)" }} />
                      <Bar dataKey="value" name="支出" fill="var(--accent)" radius={[0, 7, 7, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="glass-panel my-4 px-4 py-6 text-center md:px-8" aria-labelledby="voice-heading">
              <h2 id="voice-heading" className="text-xl font-semibold">说一句，就记好了</h2>
              <p className="mt-1 text-sm text-[var(--dim)]">例如：“午饭花了三十五元”</p>
              <button type="button" aria-label={listening ? "停止语音记账" : "开始语音记账"} onClick={listening ? () => { recognitionRef.current?.stop(); setListening(false); } : startListening} className={`relative isolate mx-auto mt-5 flex h-24 w-24 items-center justify-center rounded-full shadow-[0_12px_36px_rgba(23,60,52,.24)] transition active:scale-95 ${listening ? "listening-ring bg-[var(--danger)] text-white" : "bg-[var(--accent)] text-[var(--accent-ink)]"}`}><MicIcon /></button>
              <p className="mt-3 text-sm font-medium">{listening ? "正在听…说完后点一下" : "点一下开始说"}</p>
              <div className="mx-auto mt-5 max-w-md text-left">
                <label htmlFor="spoken-entry" className="mb-2 block text-xs font-semibold text-[var(--dim)]">识别内容</label>
                <div className="flex items-stretch gap-2">
                  <textarea id="spoken-entry" aria-label="记账语句" value={transcript || interim} onChange={(event) => { setTranscript(event.target.value); setInterim(""); }} placeholder="也可以在这里输入一句话" rows={2} className="glass-control min-h-16 flex-1 resize-none rounded-[var(--radius)] border border-[var(--border)] px-4 py-3 text-base outline-none focus:border-[var(--accent)]" />
                  <button type="button" onClick={() => { const text = `${transcript} ${interim}`.trim(); if (text) parseVoice.mutate(text); }} disabled={!`${transcript}${interim}`.trim() || parseVoice.isPending} className="w-20 rounded-[14px] bg-[var(--warm)] px-3 text-sm font-bold text-[#2d2512] disabled:opacity-45">{parseVoice.isPending ? "理解中" : "下一步"}</button>
                </div>
                {(speechError || parseVoice.error) && <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{speechError || "没有理解这句话，请换种说法。"}</p>}
              </div>
            </section>

            <section className="pb-2" aria-labelledby="records-heading">
              <div className="glass-strip mb-3 flex items-center justify-between px-4 py-3"><h2 id="records-heading" className="text-lg font-bold">本月账目</h2><span className="text-xs text-[var(--dim)]">{monthRows.length} 笔</span></div>
              {records.isPending ? <p className="py-8 text-center text-sm text-[var(--text-on-image)]">正在读取账本…</p> : records.error ? (
                <div className="glass-panel p-5 text-center"><p className="text-sm text-[var(--danger)]">账目暂时读取失败</p><button type="button" onClick={() => records.refetch()} className="mt-3 text-sm font-semibold underline">重新加载</button></div>
              ) : monthRows.length === 0 ? (
                <div className="glass-panel px-5 py-8 text-center"><p className="font-semibold">这个月还没有账目</p><p className="mt-1 text-sm text-[var(--dim)]">说一句话，记下第一笔。</p></div>
              ) : (
                <div className="glass-panel overflow-hidden">
                  {monthRows.map((row: Transaction) => {
                    const info = categoryInfo(row.category);
                    return <div key={row.id} className="flex min-h-18 items-center gap-3 border-b border-[var(--border)] px-4 py-3 last:border-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--soft)] text-sm font-bold text-[var(--accent)]">{info.mark}</div>
                      <div className="min-w-0 flex-1"><p className="truncate font-semibold">{row.note || info.label}</p><p className="text-xs text-[var(--dim)]">{info.label} · {new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(row.occurred_at))}</p></div>
                      <p className={`amount-font shrink-0 text-lg font-bold ${row.kind === "income" ? "text-[var(--accent)]" : ""}`}>{row.kind === "income" ? "+" : "−"}{yuan(row.amount_cents)}</p>
                      {deleteId === row.id ? <div className="flex shrink-0 gap-1"><button type="button" aria-label="确认删除这笔账" onClick={() => deleteTransaction.mutate(row.id)} className="rounded-lg bg-[var(--danger)] px-2 py-2 text-xs font-bold text-white">确认</button><button type="button" aria-label="取消删除" onClick={() => setDeleteId(null)} className="rounded-lg bg-[var(--soft)] px-2 py-2 text-xs">取消</button></div> : <button type="button" aria-label={`删除${row.note || info.label}这笔账`} onClick={() => setDeleteId(row.id)} className="p-2 text-[var(--dim)]">×</button>}
                    </div>;
                  })}
                </div>
              )}
            </section>
          </>
        ) : (
          <>
            <section className="glass-panel mt-3 overflow-hidden" aria-labelledby="overtime-summary-heading">
              <div className="flex items-start justify-between gap-3 px-5 pt-5">
                <div><p id="overtime-summary-heading" className="text-sm text-[var(--dim)]">本月累计加班</p><p className="amount-font mt-1 text-4xl font-bold">{formatMinutes(overtimeSummary.minutes)}</p></div>
                <button type="button" onClick={() => openOvertimeForm()} className="flex items-center gap-1 rounded-[12px] bg-[var(--accent)] px-3 py-2 text-xs font-bold text-[var(--accent-ink)]"><PlusIcon />记加班</button>
              </div>
              <div className="mt-5 grid grid-cols-3 border-t border-[var(--border)]">
                <div className="border-r border-[var(--border)] px-3 py-4"><p className="text-xs text-[var(--dim)]">待结算</p><p className="amount-font mt-1 font-bold text-[var(--accent)]">{yuan(overtimeSummary.pendingPay)}</p></div>
                <div className="border-r border-[var(--border)] px-3 py-4"><p className="text-xs text-[var(--dim)]">待调休</p><p className="amount-font mt-1 font-bold">{formatMinutes(overtimeSummary.pendingTimeOff)}</p></div>
                <div className="px-3 py-4"><p className="text-xs text-[var(--dim)]">未完成</p><p className="amount-font mt-1 font-bold">{overtimeSummary.pendingCount} 条</p></div>
              </div>
            </section>

            <section className="glass-panel mt-4 px-5 py-5">
              <h2 className="text-lg font-bold">老师常用</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--dim)]">选择事项后补充起止时间，系统自动扣除休息并计算工时；也可改成直接填时长。</p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm font-semibold sm:grid-cols-4">
                <button type="button" onClick={() => openOvertimeForm("晚自习", "1")} className="glass-control rounded-[12px] border border-[var(--border)] px-2 py-3">晚自习</button>
                <button type="button" onClick={() => openOvertimeForm("周末值班", "1.5")} className="glass-control rounded-[12px] border border-[var(--border)] px-2 py-3">周末值班</button>
                <button type="button" onClick={() => openOvertimeForm("临时代课", "1")} className="glass-control rounded-[12px] border border-[var(--border)] px-2 py-3">临时代课</button>
                <button type="button" onClick={() => openOvertimeForm("监考阅卷", "1")} className="glass-control rounded-[12px] border border-[var(--border)] px-2 py-3">监考阅卷</button>
              </div>
            </section>

            <section className="mt-4 pb-2" aria-labelledby="overtime-list-heading">
              <div className="glass-strip mb-3 flex items-center justify-between px-4 py-3"><h2 id="overtime-list-heading" className="text-lg font-bold">本月明细</h2><span className="text-xs text-[var(--dim)]">{monthOvertime.length} 条</span></div>
              {overtime.isPending ? <p className="py-8 text-center text-sm text-[var(--text-on-image)]">正在读取加班记录…</p> : overtime.error ? (
                <div className="glass-panel p-5 text-center"><p className="text-sm text-[var(--danger)]">加班记录暂时读取失败</p><button type="button" onClick={() => overtime.refetch()} className="mt-3 text-sm font-semibold underline">重新加载</button></div>
              ) : monthOvertime.length === 0 ? (
                <div className="glass-panel px-5 py-8 text-center"><p className="font-semibold">这个月还没有加班记录</p><p className="mt-1 text-sm text-[var(--dim)]">点“记加班”，起止时间、工时和结算一起记。</p></div>
              ) : (
                <div className="space-y-2">
                  {monthOvertime.map((entry: OvertimeEntry) => <article key={entry.id} className="glass-panel px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-[12px] bg-[var(--soft)] leading-none"><span className="text-[10px] text-[var(--dim)]">{shortDate(entry.work_date).split("月")[0]}月</span><span className="mt-1 text-sm font-bold">{shortDate(entry.work_date).split("月")[1]?.replace("日", "")}</span></div>
                      <button type="button" onClick={() => editOvertime(entry)} aria-label={`编辑${entry.note || "加班"}记录`} className="min-w-0 flex-1 text-left">
                        <div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold">{entry.note || "加班"}</p><span className={`status-chip ${entry.status === "settled" ? "status-done" : "status-pending"}`}>{entry.status === "settled" ? "已完成" : "待处理"}</span></div>
                        <p className="mt-1 text-xs text-[var(--dim)]">{entry.start_time && entry.end_time ? `${entry.start_time}–${entry.end_time} · ` : ""}{formatMinutes(entry.minutes)}{entry.break_minutes > 0 ? ` · 休息${entry.break_minutes}分` : ""}</p>
                      </button>
                      <div className="shrink-0 text-right"><p className="amount-font font-bold">{entry.compensation_type === "pay" ? yuan(entry.pay_cents) : "调休"}</p><p className="mt-1 text-[11px] text-[var(--dim)]">{entry.compensation_type === "pay" ? `${entry.multiplier_hundredths / 100} 倍` : formatMinutes(entry.minutes)}</p></div>
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-2 border-t border-[var(--border)] pt-2">
                      <button type="button" disabled={changeOvertimeStatus.isPending} onClick={() => changeOvertimeStatus.mutate({ id: entry.id, status: entry.status === "pending" ? "settled" : "pending" })} className="rounded-lg bg-[var(--soft)] px-3 py-2 text-xs font-semibold">{entry.status === "pending" ? (entry.compensation_type === "pay" ? "标记已结算" : "标记已调休") : "改回待处理"}</button>
                      <button type="button" onClick={() => editOvertime(entry)} className="rounded-lg bg-[var(--soft)] px-3 py-2 text-xs font-semibold">编辑</button>
                      {deleteOvertimeId === entry.id ? <><button type="button" aria-label="确认删除这条加班记录" onClick={() => deleteOvertime.mutate(entry.id)} className="rounded-lg bg-[var(--danger)] px-3 py-2 text-xs font-bold text-white">确认删除</button><button type="button" aria-label="取消删除加班记录" onClick={() => setDeleteOvertimeId(null)} className="rounded-lg bg-[var(--soft)] px-3 py-2 text-xs">取消</button></> : <button type="button" aria-label={`删除${entry.note || "加班"}记录`} onClick={() => setDeleteOvertimeId(entry.id)} className="rounded-lg px-3 py-2 text-xs text-[var(--danger)]">删除</button>}
                    </div>
                  </article>)}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {budgetOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="budget-title">
          <div className="glass-dialog modal-sheet">
            <div className="modal-handle" />
            <div className="flex items-center justify-between"><div><h2 id="budget-title" className="text-xl font-bold">设置月度总额</h2><p className="mt-0.5 text-sm text-[var(--dim)]">{monthLabel(selectedMonth)}可支配资金</p></div><button type="button" aria-label="关闭月度总额设置" onClick={() => setBudgetOpen(false)} className="h-10 w-10 rounded-full bg-[var(--soft)] text-xl">×</button></div>
            <label htmlFor="budget-amount" className="mt-6 block text-xs font-semibold text-[var(--dim)]">总额（元）</label>
            <div className="amount-font mt-1 flex items-center border-b-2 border-[var(--accent)] pb-2"><span className="text-2xl">¥</span><input id="budget-amount" inputMode="decimal" value={budgetAmount} onChange={(event) => setBudgetAmount(event.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" className="min-w-0 flex-1 bg-transparent px-2 text-4xl font-bold outline-none" autoFocus /></div>
            <p className="mt-3 text-sm text-[var(--dim)]">可以填工资到账额、生活费或本月预算，支出会从中扣减。</p>
            {setBudget.error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">保存失败，请再试一次。</p>}
            <button type="button" disabled={!budgetValid || setBudget.isPending} onClick={() => setBudget.mutate()} className="primary-wide">{setBudget.isPending ? "正在保存…" : "保存月度总额"}</button>
          </div>
        </div>
      )}

      {overtimeOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="overtime-title">
          <div className="glass-dialog modal-sheet max-h-[94vh] overflow-y-auto">
            <div className="modal-handle" />
            <div className="flex items-center justify-between"><div><h2 id="overtime-title" className="text-xl font-bold">{editingOvertimeId == null ? "记录加班" : "编辑加班"}</h2><p className="mt-0.5 text-sm text-[var(--dim)]">时间、补偿方式和处理状态</p></div><button type="button" aria-label="关闭加班记录" onClick={() => setOvertimeOpen(false)} className="h-10 w-10 rounded-full bg-[var(--soft)] text-xl">×</button></div>

            <label htmlFor="work-date" className="mt-5 block text-xs font-semibold text-[var(--dim)]">日期</label>
            <input id="work-date" type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} className="form-control" />

            <div className="mt-4 grid grid-cols-2 gap-2 rounded-[14px] bg-[var(--soft)] p-1" aria-label="工时填写方式">
              <button type="button" onClick={() => setDurationMode("clock")} className={`rounded-[11px] py-2.5 text-sm font-bold ${durationMode === "clock" ? "bg-[var(--surface-strong)] shadow-sm" : "text-[var(--dim)]"}`}>按起止时间</button>
              <button type="button" onClick={() => setDurationMode("manual")} className={`rounded-[11px] py-2.5 text-sm font-bold ${durationMode === "manual" ? "bg-[var(--surface-strong)] shadow-sm" : "text-[var(--dim)]"}`}>直接填时长</button>
            </div>

            {durationMode === "clock" ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div><label htmlFor="start-time" className="block text-xs font-semibold text-[var(--dim)]">开始时间</label><input id="start-time" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="form-control" /></div>
                <div><label htmlFor="end-time" className="block text-xs font-semibold text-[var(--dim)]">结束时间</label><input id="end-time" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="form-control" /></div>
                <div className="col-span-2"><label htmlFor="break-minutes" className="block text-xs font-semibold text-[var(--dim)]">休息时间（分钟）</label><input id="break-minutes" inputMode="numeric" value={breakMinutes} onChange={(event) => setBreakMinutes(event.target.value.replace(/\D/g, ""))} placeholder="0" className="form-control" /></div>
              </div>
            ) : (
              <div className="mt-4"><label htmlFor="work-hours" className="block text-xs font-semibold text-[var(--dim)]">加班时长（小时）</label><input id="work-hours" inputMode="decimal" value={workHours} onChange={(event) => setWorkHours(event.target.value.replace(/[^0-9.]/g, ""))} placeholder="如 2.5" className="form-control" /></div>
            )}
            <div className="mt-3 flex items-center justify-between rounded-[12px] bg-[var(--soft)] px-4 py-3"><span className="text-sm text-[var(--dim)]">本次计入工时</span><strong className="amount-font">{calculatedMinutes > 0 ? formatMinutes(calculatedMinutes) : "请检查时间"}</strong></div>

            <label htmlFor="work-note" className="mt-4 block text-xs font-semibold text-[var(--dim)]">事项</label><input id="work-note" value={workNote} onChange={(event) => setWorkNote(event.target.value)} maxLength={80} placeholder="如：晚自习、周末值班" className="form-control" />

            <p className="mt-4 text-xs font-semibold text-[var(--dim)]">补偿方式</p>
            <div className="mt-1 grid grid-cols-2 gap-2 rounded-[14px] bg-[var(--soft)] p-1">
              <button type="button" onClick={() => setCompensationType("pay")} className={`rounded-[11px] py-2.5 text-sm font-bold ${compensationType === "pay" ? "bg-[var(--surface-strong)] shadow-sm" : "text-[var(--dim)]"}`}>加班费</button>
              <button type="button" onClick={() => setCompensationType("time_off")} className={`rounded-[11px] py-2.5 text-sm font-bold ${compensationType === "time_off" ? "bg-[var(--surface-strong)] shadow-sm" : "text-[var(--dim)]"}`}>调休</button>
            </div>

            {compensationType === "pay" && <div className="mt-4 grid grid-cols-2 gap-3">
              <div><label htmlFor="hourly-rate" className="block text-xs font-semibold text-[var(--dim)]">时薪（元）</label><input id="hourly-rate" inputMode="decimal" value={hourlyRate} onChange={(event) => setHourlyRate(event.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" className="form-control" /></div>
              <div><label htmlFor="multiplier" className="block text-xs font-semibold text-[var(--dim)]">倍率</label><select id="multiplier" value={multiplier} onChange={(event) => setMultiplier(event.target.value)} className="form-control"><option value="1">1 倍</option><option value="1.5">1.5 倍</option><option value="2">2 倍</option><option value="3">3 倍</option></select></div>
            </div>}

            <label htmlFor="overtime-status" className="mt-4 block text-xs font-semibold text-[var(--dim)]">处理状态</label>
            <select id="overtime-status" value={overtimeStatus} onChange={(event) => setOvertimeStatus(event.target.value as OvertimeStatus)} className="form-control"><option value="pending">待处理</option><option value="settled">{compensationType === "pay" ? "已结算" : "已调休"}</option></select>

            <div className="mt-5 flex items-center justify-between rounded-[14px] bg-[var(--soft)] px-4 py-3"><span className="text-sm text-[var(--dim)]">{compensationType === "pay" ? "预计金额" : "可调休时长"}</span><strong className="amount-font text-xl">{compensationType === "pay" ? yuan(projectedPay) : formatMinutes(Math.max(0, calculatedMinutes))}</strong></div>
            {saveOvertime.error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">保存失败，请检查填写内容。</p>}
            <button type="button" disabled={!overtimeValid || !workDate || saveOvertime.isPending} onClick={() => saveOvertime.mutate()} className="primary-wide">{saveOvertime.isPending ? "正在保存…" : editingOvertimeId == null ? "保存加班记录" : "保存修改"}</button>
          </div>
        </div>
      )}

      {reviewOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="review-title">
          <div className="glass-dialog modal-sheet max-h-[92vh] overflow-y-auto">
            <div className="modal-handle" />
            <div className="flex items-center justify-between"><h2 id="review-title" className="text-xl font-bold">确认这笔账</h2><button type="button" aria-label="关闭确认" onClick={() => setReviewOpen(false)} className="h-10 w-10 rounded-full bg-[var(--soft)] text-xl">×</button></div>
            <div className="mt-5 grid grid-cols-2 gap-2 rounded-[14px] bg-[var(--soft)] p-1"><button type="button" onClick={() => { setKind("expense"); if (category === "income") setCategory("other"); }} className={`rounded-[11px] py-2.5 text-sm font-bold ${kind === "expense" ? "bg-[var(--surface-strong)] shadow-sm" : "text-[var(--dim)]"}`}>支出</button><button type="button" onClick={() => { setKind("income"); setCategory("income"); }} className={`rounded-[11px] py-2.5 text-sm font-bold ${kind === "income" ? "bg-[var(--surface-strong)] shadow-sm" : "text-[var(--dim)]"}`}>收入</button></div>
            <label htmlFor="amount" className="mt-5 block text-xs font-semibold text-[var(--dim)]">金额（元）</label><div className="amount-font mt-1 flex items-center border-b-2 border-[var(--accent)] pb-2"><span className="text-2xl">¥</span><input id="amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" className="min-w-0 flex-1 bg-transparent px-2 text-4xl font-bold outline-none" autoFocus /></div>
            <label htmlFor="category" className="mt-5 block text-xs font-semibold text-[var(--dim)]">分类</label><select id="category" value={category} onChange={(event) => setCategory(event.target.value as Category)} className="form-control">{categories.filter((item) => kind === "income" ? item.value === "income" : item.value !== "income").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            <label htmlFor="note" className="mt-4 block text-xs font-semibold text-[var(--dim)]">备注</label><input id="note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={80} placeholder="这笔钱花在哪儿" className="form-control" />
            {addTransaction.error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">保存失败，请再试一次。</p>}
            <button type="button" disabled={!amountValid || addTransaction.isPending} onClick={() => addTransaction.mutate()} className="primary-wide">{addTransaction.isPending ? "正在保存…" : "确认保存"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
