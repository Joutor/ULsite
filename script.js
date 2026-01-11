let employeeCounter = 1
let tasksPerMonthCounter = 100
const pricePerMonth = 1000
const pricePerYear = 10000

function employeeCounterPlus() {
	employeeCounter += 1
	updateEmployeeCounters()
}

function employeeCounterMinus() {
	employeeCounter -= 1
	if (employeeCounter <= 0) {
		employeeCounter = 1
	}
	updateEmployeeCounters()
}

function updateEmployeeCounters() {
	document.getElementById("demo").innerHTML = `${formatThousandsSpaces(pricePerMonth * employeeCounter)} ₽ / ${formatEmployees(employeeCounter)}`
	document.getElementById("demo_2").innerHTML = `${formatThousandsSpaces(pricePerYear * employeeCounter)} ₽ / ${formatEmployees(employeeCounter)}`
	document.getElementById("demo_1").innerHTML = employeeCounter
}

function helpdeskTimeSavingsMinus() {
	tasksPerMonthCounter -= 100
	if (tasksPerMonthCounter <= 0) {
		tasksPerMonthCounter = 100
	}
	calcHelpdeskTimeSavings()
}

function helpdeskTimeSavingsPlus() {
	tasksPerMonthCounter += 100
	calcHelpdeskTimeSavings()
}

/**
 * Оценка экономии времени и FTE при внедрении ULDESK
 * Вход: N — заявок в месяц
 * По умолчанию подставляет средние “рыночные” значения (можно переопределять через opts).
 *
 * Возвращает:
 * - manualHours: трудозатраты при ручной омниканальной обработке (ч/мес)
 * - withSystemHours: трудозатраты с системой (ч/мес)
 * - savedHours: экономия (ч/мес)
 * - savedDays: экономия (раб.дней по 8ч)
 * - savedFTE: экономия (FTE по 164ч/мес)
 * - assumptions: использованные допущения
 */
function calcHelpdeskTimeSavings(opts = {}) {
	let N = tasksPerMonthCounter
	document.getElementById("tasks_per_month_calculator").innerHTML = formatThousandsSpaces(tasksPerMonthCounter)
	if (!Number.isFinite(N) || N < 0) throw new Error("N (заявок/мес) должно быть неотрицательным числом")

	// --- Средние значения (пункты 2–6 + доп. параметры модели) ---
	const defaults = {
		// (2) среднее “чистое” время решения заявки (мин)
		T: 12,

		// потери “ручной омниканальности” (мин/заявка)
		tSwitch: 1.0, // переключения между каналами/людьми
		tFind: 1.5,   // поиск истории/контекста
		tSla: 0.5,    // ручной контроль сроков/эскалаций/SLA

		// (3) дубли/повторные обращения
		d: 0.08,      // 8% дублей
		tDup: 10,     // лишние минуты на дубль

		// (4) потерянные/пропущенные обращения
		l: 0.02,      // 2% теряются
		tLost: 30,    // среднее время на восстановление/разбор

		// (5) ошибки/переоткрытия из-за контекста/учёта
		e: 0.04,      // 4% ошибок/переоткрытий
		tErr: 15,     // время на исправление

		// (6) стоимость часа (не используется для времени/FTE, но оставлено для расширения)
		C: 800,       // ₽/час

		// --- Эффект внедрения системы (типовые средние) ---
		selfService: 0.10,          // доля обращений, не создающихся из-за базы знаний (10%)
		baseResolutionReduction: 0.10, // ускорение “чистого” решения за счёт шаблонов/макросов (10%)

		overheadReduction: 0.60,    // снижение tSwitch+tFind+tSla (60%)
		defectReduction: 0.50       // снижение дублей/потерь/ошибок (50%)
	}

	const p = {...defaults, ...opts}

	// Валидация долей 0..1
	for (const k of ["d", "l", "e", "selfService", "baseResolutionReduction", "overheadReduction", "defectReduction"]) {
		if (!Number.isFinite(p[k]) || p[k] < 0 || p[k] > 1) throw new Error(`${k} должно быть числом в диапазоне 0..1`)
	}

	// --- 1) Нагрузка без системы (ручная омниканальность) ---
	const manualMinutes =
		N * (p.T + p.tSwitch + p.tFind + p.tSla) +
		N * p.d * p.tDup +
		N * p.l * p.tLost +
		N * p.e * p.tErr

	// --- 2) Нагрузка с системой ---
	// часть обращений “съедает” база знаний (самообслуживание)
	const N_eff = N * (1 - p.selfService)

	const overheadPerTicket = (p.tSwitch + p.tFind + p.tSla) * (1 - p.overheadReduction)
	const baseT = p.T * (1 - p.baseResolutionReduction)

	const d_eff = p.d * (1 - p.defectReduction)
	const l_eff = p.l * (1 - p.defectReduction)
	const e_eff = p.e * (1 - p.defectReduction)

	const withSystemMinutes =
		N_eff * (baseT + overheadPerTicket) +
		N_eff * d_eff * p.tDup +
		N_eff * l_eff * p.tLost +
		N_eff * e_eff * p.tErr

	// --- 3) Итог: экономия времени и FTE ---
	const manualHours = manualMinutes / 60
	const withSystemHours = withSystemMinutes / 60
	const savedHours = Math.max(0, manualHours - withSystemHours)

	const savedDays = savedHours / 8   // 8ч рабочий день
	const savedFTE = savedHours / 164  // 160ч в месяц на 1 FTE
	const savedRub = savedHours * p.C

	const res = {
		manualHours,
		withSystemHours,
		savedHours,
		savedDays,
		savedFTE,
		savedRub,
		assumptions: {
			T_min: p.T,
			overhead_min_per_ticket: {tSwitch: p.tSwitch, tFind: p.tFind, tSla: p.tSla},
			rates: {d: p.d, l: p.l, e: p.e},
			times_min: {tDup: p.tDup, tLost: p.tLost, tErr: p.tErr},
			effects: {
				selfService: p.selfService,
				baseResolutionReduction: p.baseResolutionReduction,
				overheadReduction: p.overheadReduction,
				defectReduction: p.defectReduction
			},
			C_rub_per_hour: p.C
		}
	}

	document.getElementById("economy-hours").innerHTML = `≈ ${formatThousandsSpaces(savedHours.toFixed(0))} ч`
	document.getElementById("economy-fte").innerHTML = `≈ ${savedFTE.toFixed(2)} FTE`
	document.getElementById("economy-money").innerHTML = `≈ ${formatThousandsSpaces(savedRub.toFixed(0))} ₽`
}

function formatThousandsSpaces(value) {
	if (value === null || value === undefined) return ""
	const str = String(value).trim()
	if (!str) return ""
	// Убираем пробелы внутри (на случай "1 234 567")
	const cleaned = str.replace(/\s+/g, "")
	// Поддержка знака и десятичной части (точка или запятая)
	const match = cleaned.match(/^([+-]?)(\d+)([.,]\d+)?$/)
	if (!match) return str // если это не число — возвращаем как есть
	const [, sign, intPart, fracPart = ""] = match
	const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ")
	return sign + formattedInt + fracPart
}

function formatEmployees(count) {
	const n = Math.abs(Number(count));

	// если не число
	if (!Number.isFinite(n)) return `${count} сотрудников`;

	const mod10 = n % 10;
	const mod100 = n % 100;

	let word;
	if (mod100 >= 11 && mod100 <= 14) {
		word = "сотрудников";
	} else if (mod10 === 1) {
		word = "сотрудник";
	} else if (mod10 >= 2 && mod10 <= 4) {
		word = "сотрудника";
	} else {
		word = "сотрудников";
	}

	return `${count} ${word}`;
}