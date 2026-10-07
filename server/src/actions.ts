import { defineAction, z, type ActionsModule } from "@hatch/space-sdk";
import { desc, eq } from "drizzle-orm";
import * as schema from "./schema";

const kindSchema = z.enum(["expense", "income"]);
const categorySchema = z.enum([
  "food",
  "transport",
  "shopping",
  "home",
  "health",
  "entertainment",
  "income",
  "other",
]);
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const dateSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/);

const parsedVoiceSchema = z.object({
  amount: z.number().positive().nullable(),
  kind: kindSchema,
  category: categorySchema,
  note: z.string().max(80),
  confidence: z.enum(["high", "medium", "low"]),
});

const transactionSchema = z.object({
  id: z.number(),
  kind: kindSchema,
  amount_cents: z.number(),
  category: z.string(),
  note: z.string(),
  spoken_text: z.string().nullable(),
  occurred_at: z.string(),
  created_at: z.string(),
});

const monthlyBudgetSchema = z.object({
  year_month: monthSchema,
  total_cents: z.number(),
  updated_at: z.string(),
});

const compensationTypeSchema = z.enum(["pay", "time_off"]);
const overtimeStatusSchema = z.enum(["pending", "settled"]);
const overtimeTypeSchema = z.enum(["workday", "rest_day", "holiday"]);
const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable();

const overtimeEntrySchema = z.object({
  id: z.number(),
  work_date: dateSchema,
  minutes: z.number(),
  hourly_rate_cents: z.number(),
  multiplier_hundredths: z.number(),
  pay_cents: z.number(),
  note: z.string(),
  start_time: clockTimeSchema,
  end_time: clockTimeSchema,
  break_minutes: z.number(),
  compensation_type: compensationTypeSchema,
  status: overtimeStatusSchema,
  overtime_type: overtimeTypeSchema,
  allowance_cents: z.number(),
  deduction_cents: z.number(),
  created_at: z.string(),
});

const overtimeInputSchema = z.object({
  work_date: dateSchema,
  minutes: z.number().int().positive().max(1440),
  hourly_rate_cents: z.number().int().min(0).max(99999999),
  multiplier_hundredths: z.number().int().min(100).max(300),
  note: z.string().trim().max(80),
  start_time: clockTimeSchema,
  end_time: clockTimeSchema,
  break_minutes: z.number().int().min(0).max(720),
  compensation_type: compensationTypeSchema,
  status: overtimeStatusSchema,
  overtime_type: overtimeTypeSchema,
  allowance_cents: z.number().int().min(0).max(99999999),
  deduction_cents: z.number().int().min(0).max(99999999),
});

const overtimeSettingsSchema = z.object({
  base_salary_cents: z.number(),
  standard_days_hundredths: z.number(),
  standard_hours_hundredths: z.number(),
  calculated_hourly_rate_cents: z.number(),
  updated_at: z.string().nullable(),
});

const activeShiftSchema = z.object({
  work_date: dateSchema,
  start_time: z.string(),
  started_at: z.string(),
  note: z.string(),
  overtime_type: overtimeTypeSchema,
  compensation_type: compensationTypeSchema,
});

const updateManifestSchema = z.object({
  version: z.string().trim().min(1).max(40),
  version_code: z.number().int().positive(),
  title: z.string().trim().min(1).max(80),
  notes: z.array(z.string().trim().min(1).max(160)).max(12),
  apk_url: z.string().url().nullable(),
  published_at: z.string().datetime().nullable().default(null),
});

const updateCheckResponseSchema = z.object({
  status: z.enum(["up_to_date", "update_available", "manifest_missing", "package_pending", "check_failed"]),
  message: z.string(),
  checked_at: z.string(),
  source_url: z.string().url(),
  latest: updateManifestSchema.nullable(),
});

const REPOSITORY_URL = "https://github.com/shuting52/jizhangben.git";

function decodeHtmlAttribute(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

function findManifestLink(html: string, baseUrl: string) {
  const matches = html.matchAll(/href=["']([^"']*version\.json[^"']*)["']/gi);
  for (const match of matches) {
    const href = match[1];
    if (!href) continue;
    try {
      return new URL(decodeHtmlAttribute(href), baseUrl).toString();
    } catch {
      continue;
    }
  }
  return null;
}

function findRawManifestLink(html: string, baseUrl: string) {
  const patterns = [
    /"rawBlobUrl":"([^"]+)"/i,
    /"rawLinesUrl":"([^"]+)"/i,
    /href=["']([^"']+)["'][^>]*>\s*Raw\s*</i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    const href = match?.[1];
    if (!href) continue;
    try {
      const decoded = decodeHtmlAttribute(href.replace(/\\u002F/g, "/"));
      return new URL(decoded, baseUrl).toString();
    } catch {
      continue;
    }
  }
  return null;
}

export const Actions = {
  checkForUpdate: defineAction({
    request: z.object({ current_version_code: z.number().int().positive() }),
    response: updateCheckResponseSchema,
    async handler(_ctx, args): Promise<z.infer<typeof updateCheckResponseSchema>> {
      const checkedAt = new Date().toISOString();
      try {
        const repositoryResponse = await fetch(REPOSITORY_URL, {
          headers: { Accept: "text/html", "User-Agent": "Bookkeeping-App-Update-Checker" },
          redirect: "follow",
        });
        if (!repositoryResponse.ok) {
          return { status: "check_failed", message: "暂时无法连接版本仓库，请稍后再试。", checked_at: checkedAt, source_url: REPOSITORY_URL, latest: null };
        }
        const repositoryHtml = await repositoryResponse.text();
        const manifestPageUrl = findManifestLink(repositoryHtml, repositoryResponse.url || REPOSITORY_URL);
        if (!manifestPageUrl) {
          return { status: "manifest_missing", message: "更新通道已接入，等待仓库发布 version.json。", checked_at: checkedAt, source_url: REPOSITORY_URL, latest: null };
        }
        const manifestPageResponse = await fetch(manifestPageUrl, {
          headers: { Accept: "text/html", "User-Agent": "Bookkeeping-App-Update-Checker" },
          redirect: "follow",
        });
        if (!manifestPageResponse.ok) {
          return { status: "check_failed", message: "版本信息暂时读取失败，请稍后再试。", checked_at: checkedAt, source_url: REPOSITORY_URL, latest: null };
        }
        const manifestPageHtml = await manifestPageResponse.text();
        const rawManifestUrl = findRawManifestLink(manifestPageHtml, manifestPageResponse.url || manifestPageUrl);
        if (!rawManifestUrl) {
          return { status: "check_failed", message: "version.json 已找到，但内容暂时无法读取。", checked_at: checkedAt, source_url: REPOSITORY_URL, latest: null };
        }
        const manifestResponse = await fetch(rawManifestUrl, {
          headers: { Accept: "application/json", "User-Agent": "Bookkeeping-App-Update-Checker" },
          redirect: "follow",
        });
        if (!manifestResponse.ok) {
          return { status: "check_failed", message: "版本信息暂时读取失败，请稍后再试。", checked_at: checkedAt, source_url: REPOSITORY_URL, latest: null };
        }
        const latest = updateManifestSchema.parse(await manifestResponse.json());
        if (latest.version_code <= args.current_version_code) {
          return { status: "up_to_date", message: `当前已是最新版（${latest.version}）。`, checked_at: checkedAt, source_url: REPOSITORY_URL, latest };
        }
        if (!latest.apk_url) {
          return { status: "package_pending", message: `发现 ${latest.version}，安装包还在准备中。`, checked_at: checkedAt, source_url: REPOSITORY_URL, latest };
        }
        return { status: "update_available", message: `发现新版本 ${latest.version}。`, checked_at: checkedAt, source_url: REPOSITORY_URL, latest };
      } catch {
        return { status: "check_failed", message: "检查更新失败，请确认网络后重试。", checked_at: checkedAt, source_url: REPOSITORY_URL, latest: null };
      }
    },
  }),

  listTransactions: defineAction({
    request: z.object({ limit: z.number().int().positive().max(300).default(100) }),
    response: z.object({ transactions: z.array(transactionSchema) }),
    async handler(ctx, args) {
      const rows = await ctx
        .db<typeof schema>()
        .select()
        .from(schema.transactions)
        .orderBy(desc(schema.transactions.occurredAt), desc(schema.transactions.id))
        .limit(args.limit);
      return {
        transactions: rows.map((row) => ({
          id: row.id,
          kind: row.kind,
          amount_cents: row.amountCents,
          category: row.category,
          note: row.note,
          spoken_text: row.spokenText,
          occurred_at: row.occurredAt.toISOString(),
          created_at: row.createdAt.toISOString(),
        })),
      };
    },
  }),

  parseVoiceEntry: defineAction({
    request: z.object({ transcript: z.string().trim().min(1).max(300) }),
    response: parsedVoiceSchema,
    async handler(ctx, args): Promise<z.infer<typeof parsedVoiceSchema>> {
      return ctx.inference.complete(
        `理解这句中文记账口述：“${args.transcript}”。提取金额（人民币元）、收支类型、分类和简短备注。分类只能从 food（餐饮）、transport（交通）、shopping（购物）、home（居家）、health（医疗健康）、entertainment（娱乐）、income（收入）、other（其他）中选择。若金额没有明确说出，amount 设为 null。收入包括工资、奖金、退款等；其余默认支出。note 保留商家、物品或用途，去掉金额和“花了/收入”等冗余词。confidence 表示整体解析置信度。`,
        { schema: parsedVoiceSchema },
      );
    },
  }),

  addTransaction: defineAction({
    request: z.object({
      kind: kindSchema,
      amount_cents: z.number().int().positive().max(999999999),
      category: categorySchema,
      note: z.string().trim().max(80),
      spoken_text: z.string().trim().max(300).nullable(),
      occurred_at: z.string().datetime(),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const inserted = await ctx
        .db<typeof schema>()
        .insert(schema.transactions)
        .values({
          kind: args.kind,
          amountCents: args.amount_cents,
          category: args.category,
          note: args.note,
          spokenText: args.spoken_text,
          occurredAt: new Date(args.occurred_at),
        })
        .returning({ id: schema.transactions.id });
      const row = inserted[0];
      if (!row) throw new Error("保存失败，请稍后再试");
      ctx.invalidateQueries();
      return { id: row.id };
    },
  }),

  deleteTransaction: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      await ctx.db<typeof schema>().delete(schema.transactions).where(eq(schema.transactions.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  listMonthlyBudgets: defineAction({
    request: z.object({}),
    response: z.object({ budgets: z.array(monthlyBudgetSchema) }),
    async handler(ctx) {
      const rows = await ctx.db<typeof schema>().select().from(schema.monthlyBudgets).orderBy(desc(schema.monthlyBudgets.yearMonth));
      return {
        budgets: rows.map((row) => ({
          year_month: row.yearMonth,
          total_cents: row.totalCents,
          updated_at: row.updatedAt.toISOString(),
        })),
      };
    },
  }),

  setMonthlyBudget: defineAction({
    request: z.object({ year_month: monthSchema, total_cents: z.number().int().positive().max(999999999) }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      await ctx
        .db<typeof schema>()
        .insert(schema.monthlyBudgets)
        .values({ yearMonth: args.year_month, totalCents: args.total_cents, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: schema.monthlyBudgets.yearMonth,
          set: { totalCents: args.total_cents, updatedAt: new Date() },
        });
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  listOvertimeEntries: defineAction({
    request: z.object({ limit: z.number().int().positive().max(300).default(100) }),
    response: z.object({ entries: z.array(overtimeEntrySchema) }),
    async handler(ctx, args) {
      const rows = await ctx
        .db<typeof schema>()
        .select()
        .from(schema.overtimeEntries)
        .orderBy(desc(schema.overtimeEntries.workDate), desc(schema.overtimeEntries.id))
        .limit(args.limit);
      return {
        entries: rows.map((row) => ({
          id: row.id,
          work_date: row.workDate,
          minutes: row.minutes,
          hourly_rate_cents: row.hourlyRateCents,
          multiplier_hundredths: row.multiplierHundredths,
          pay_cents: row.payCents,
          note: row.note,
          start_time: row.startTime,
          end_time: row.endTime,
          break_minutes: row.breakMinutes,
          compensation_type: row.compensationType,
          status: row.status,
          overtime_type: row.overtimeType,
          allowance_cents: row.allowanceCents,
          deduction_cents: row.deductionCents,
          created_at: row.createdAt.toISOString(),
        })),
      };
    },
  }),

  addOvertimeEntry: defineAction({
    request: overtimeInputSchema,
    response: z.object({ id: z.number(), pay_cents: z.number() }),
    async handler(ctx, args) {
      const payCents = args.compensation_type === "pay"
        ? Math.round((args.minutes / 60) * args.hourly_rate_cents * (args.multiplier_hundredths / 100))
        : 0;
      const inserted = await ctx
        .db<typeof schema>()
        .insert(schema.overtimeEntries)
        .values({
          workDate: args.work_date,
          minutes: args.minutes,
          hourlyRateCents: args.hourly_rate_cents,
          multiplierHundredths: args.multiplier_hundredths,
          payCents,
          note: args.note,
          startTime: args.start_time,
          endTime: args.end_time,
          breakMinutes: args.break_minutes,
          compensationType: args.compensation_type,
          status: args.status,
          overtimeType: args.overtime_type,
          allowanceCents: args.allowance_cents,
          deductionCents: args.deduction_cents,
        })
        .returning({ id: schema.overtimeEntries.id });
      const row = inserted[0];
      if (!row) throw new Error("保存失败，请稍后再试");
      ctx.invalidateQueries();
      return { id: row.id, pay_cents: payCents };
    },
  }),

  updateOvertimeEntry: defineAction({
    request: overtimeInputSchema.extend({ id: z.number().int().positive() }),
    response: z.object({ id: z.number(), pay_cents: z.number() }),
    async handler(ctx, args): Promise<{ id: number; pay_cents: number }> {
      const payCents = args.compensation_type === "pay"
        ? Math.round((args.minutes / 60) * args.hourly_rate_cents * (args.multiplier_hundredths / 100))
        : 0;
      await ctx.db<typeof schema>().update(schema.overtimeEntries).set({
        workDate: args.work_date,
        minutes: args.minutes,
        hourlyRateCents: args.hourly_rate_cents,
        multiplierHundredths: args.multiplier_hundredths,
        payCents,
        note: args.note,
        startTime: args.start_time,
        endTime: args.end_time,
        breakMinutes: args.break_minutes,
        compensationType: args.compensation_type,
        status: args.status,
        overtimeType: args.overtime_type,
        allowanceCents: args.allowance_cents,
        deductionCents: args.deduction_cents,
      }).where(eq(schema.overtimeEntries.id, args.id));
      ctx.invalidateQueries();
      return { id: args.id, pay_cents: payCents };
    },
  }),

  setOvertimeStatus: defineAction({
    request: z.object({ id: z.number().int().positive(), status: overtimeStatusSchema }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      await ctx.db<typeof schema>().update(schema.overtimeEntries).set({ status: args.status }).where(eq(schema.overtimeEntries.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  getOvertimeSettings: defineAction({
    request: z.object({}),
    response: overtimeSettingsSchema,
    async handler(ctx): Promise<z.infer<typeof overtimeSettingsSchema>> {
      const row = await ctx.db<typeof schema>().select().from(schema.overtimeSettings).where(eq(schema.overtimeSettings.id, 1)).limit(1);
      const settings = row[0];
      if (!settings) {
        return { base_salary_cents: 0, standard_days_hundredths: 2175, standard_hours_hundredths: 800, calculated_hourly_rate_cents: 0, updated_at: null };
      }
      const days = settings.standardDaysHundredths / 100;
      const hours = settings.standardHoursHundredths / 100;
      const hourly = days > 0 && hours > 0 ? Math.round(settings.baseSalaryCents / days / hours) : 0;
      return {
        base_salary_cents: settings.baseSalaryCents,
        standard_days_hundredths: settings.standardDaysHundredths,
        standard_hours_hundredths: settings.standardHoursHundredths,
        calculated_hourly_rate_cents: hourly,
        updated_at: settings.updatedAt.toISOString(),
      };
    },
  }),

  setOvertimeSettings: defineAction({
    request: z.object({
      base_salary_cents: z.number().int().min(0).max(999999999),
      standard_days_hundredths: z.number().int().min(100).max(3100),
      standard_hours_hundredths: z.number().int().min(100).max(2400),
    }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      await ctx.db<typeof schema>().insert(schema.overtimeSettings).values({
        id: 1,
        baseSalaryCents: args.base_salary_cents,
        standardDaysHundredths: args.standard_days_hundredths,
        standardHoursHundredths: args.standard_hours_hundredths,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: schema.overtimeSettings.id,
        set: {
          baseSalaryCents: args.base_salary_cents,
          standardDaysHundredths: args.standard_days_hundredths,
          standardHoursHundredths: args.standard_hours_hundredths,
          updatedAt: new Date(),
        },
      });
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  getActiveOvertimeShift: defineAction({
    request: z.object({}),
    response: z.object({ active: activeShiftSchema.nullable() }),
    async handler(ctx): Promise<{ active: z.infer<typeof activeShiftSchema> | null }> {
      const rows = await ctx.db<typeof schema>().select().from(schema.activeOvertimeShift).where(eq(schema.activeOvertimeShift.id, 1)).limit(1);
      const row = rows[0];
      return { active: row ? {
        work_date: row.workDate,
        start_time: row.startTime,
        started_at: row.startedAt.toISOString(),
        note: row.note,
        overtime_type: row.overtimeType,
        compensation_type: row.compensationType,
      } : null };
    },
  }),

  startOvertimeShift: defineAction({
    request: z.object({
      work_date: dateSchema,
      start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      started_at: z.string().datetime(),
      note: z.string().trim().max(80),
      overtime_type: overtimeTypeSchema,
      compensation_type: compensationTypeSchema,
    }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      await ctx.db<typeof schema>().insert(schema.activeOvertimeShift).values({
        id: 1,
        workDate: args.work_date,
        startTime: args.start_time,
        startedAt: new Date(args.started_at),
        note: args.note,
        overtimeType: args.overtime_type,
        compensationType: args.compensation_type,
      }).onConflictDoNothing();
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  finishOvertimeShift: defineAction({
    request: z.object({ ended_at: z.string().datetime(), end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }),
    response: z.object({ id: z.number(), minutes: z.number(), pay_cents: z.number() }),
    async handler(ctx, args): Promise<{ id: number; minutes: number; pay_cents: number }> {
      const db = ctx.db<typeof schema>();
      const shifts = await db.select().from(schema.activeOvertimeShift).where(eq(schema.activeOvertimeShift.id, 1)).limit(1);
      const shift = shifts[0];
      if (!shift) throw new Error("没有进行中的加班打卡");
      const endedAt = new Date(args.ended_at);
      const minutes = Math.max(1, Math.min(1440, Math.round((endedAt.getTime() - shift.startedAt.getTime()) / 60000)));
      const settingsRows = await db.select().from(schema.overtimeSettings).where(eq(schema.overtimeSettings.id, 1)).limit(1);
      const settings = settingsRows[0];
      const days = (settings?.standardDaysHundredths ?? 2175) / 100;
      const hours = (settings?.standardHoursHundredths ?? 800) / 100;
      const hourlyRateCents = settings && days > 0 && hours > 0 ? Math.round(settings.baseSalaryCents / days / hours) : 0;
      const multiplierHundredths = shift.overtimeType === "holiday" ? 300 : shift.overtimeType === "rest_day" ? 200 : 150;
      const payCents = shift.compensationType === "pay" ? Math.round((minutes / 60) * hourlyRateCents * (multiplierHundredths / 100)) : 0;
      const inserted = await db.insert(schema.overtimeEntries).values({
        workDate: shift.workDate,
        minutes,
        hourlyRateCents,
        multiplierHundredths,
        payCents,
        note: shift.note || "加班打卡",
        startTime: shift.startTime,
        endTime: args.end_time,
        breakMinutes: 0,
        compensationType: shift.compensationType,
        status: "pending",
        overtimeType: shift.overtimeType,
        allowanceCents: 0,
        deductionCents: 0,
      }).returning({ id: schema.overtimeEntries.id });
      const row = inserted[0];
      if (!row) throw new Error("保存失败，请稍后再试");
      await db.delete(schema.activeOvertimeShift).where(eq(schema.activeOvertimeShift.id, 1));
      ctx.invalidateQueries();
      return { id: row.id, minutes, pay_cents: payCents };
    },
  }),

  cancelOvertimeShift: defineAction({
    request: z.object({}),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx): Promise<{ ok: true }> {
      await ctx.db<typeof schema>().delete(schema.activeOvertimeShift).where(eq(schema.activeOvertimeShift.id, 1));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  deleteOvertimeEntry: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      await ctx.db<typeof schema>().delete(schema.overtimeEntries).where(eq(schema.overtimeEntries.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
} satisfies ActionsModule;
