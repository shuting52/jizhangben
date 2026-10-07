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

const overtimeEntrySchema = z.object({
  id: z.number(),
  work_date: dateSchema,
  minutes: z.number(),
  hourly_rate_cents: z.number(),
  multiplier_hundredths: z.number(),
  pay_cents: z.number(),
  note: z.string(),
  created_at: z.string(),
});

export const Actions = {
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
          created_at: row.createdAt.toISOString(),
        })),
      };
    },
  }),

  addOvertimeEntry: defineAction({
    request: z.object({
      work_date: dateSchema,
      minutes: z.number().int().positive().max(1440),
      hourly_rate_cents: z.number().int().min(0).max(99999999),
      multiplier_hundredths: z.number().int().min(100).max(300),
      note: z.string().trim().max(80),
    }),
    response: z.object({ id: z.number(), pay_cents: z.number() }),
    async handler(ctx, args) {
      const payCents = Math.round((args.minutes / 60) * args.hourly_rate_cents * (args.multiplier_hundredths / 100));
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
        })
        .returning({ id: schema.overtimeEntries.id });
      const row = inserted[0];
      if (!row) throw new Error("保存失败，请稍后再试");
      ctx.invalidateQueries();
      return { id: row.id, pay_cents: payCents };
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
