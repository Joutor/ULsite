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
	const n = Math.abs(Number(count))
	// если не число
	if (!Number.isFinite(n)) return `${count} сотрудников`
	const mod10 = n % 10
	const mod100 = n % 100
	let word
	if (mod100 >= 11 && mod100 <= 14) {
		word = "сотрудников"
	} else if (mod10 === 1) {
		word = "сотрудник"
	} else if (mod10 >= 2 && mod10 <= 4) {
		word = "сотрудника"
	} else {
		word = "сотрудников"
	}

	return `${count} ${word}`
}

function drawRibbonBackground(section, opts = {}) {
	const canvas = section.querySelector(".cards-bg")
	if (!canvas) return
	const ctx = canvas.getContext("2d")

	const isDraft = !!opts.draft
	const dpr = isDraft ? 1 : Math.min(window.devicePixelRatio || 1, 2)

	const rect = section.getBoundingClientRect()
	const w = Math.max(1, Math.floor(rect.width))
	const h = Math.max(1, Math.floor(rect.height))

	canvas.width = Math.floor(w * dpr)
	canvas.height = Math.floor(h * dpr)
	canvas.style.width = w + "px"
	canvas.style.height = h + "px"

	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
	ctx.clearRect(0, 0, w, h)

	const ribbons = opts.ribbons ?? []
	if (ribbons.length === 0) return

	const text = opts.text ?? "пробный период 1 месяц"
	const font = opts.font ?? '600 14px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial'
	const ribbonColor = opts.ribbonColor ?? "#6B4CFF"
	const fadeH = opts.fadeH ?? 200
	const fadeTo = opts.fadeTo ?? "#fff"

	const L = Math.hypot(w, h) * 2.0
	const x0 = -L * 0.2
	const x1 = w + L * 0.2

	ctx.font = font
	ctx.textBaseline = "middle"

	for (const r of ribbons) {
		const angle = (r.angleDeg * Math.PI) / 180
		const slope = Math.tan(angle)
		const yAtX0 = r.y + slope * (x0 - w * 0.5)
		const yAtX1 = r.y + slope * (x1 - w * 0.5)
		// тень только в финальном режиме
		ctx.save()
		if (!isDraft) {
			ctx.shadowColor = "rgba(0,0,0,0.18)"
			ctx.shadowBlur = 10
			ctx.shadowOffsetX = 0
			ctx.shadowOffsetY = 4
		}
		// лента
		ctx.beginPath()
		ctx.moveTo(x0, yAtX0)
		ctx.lineTo(x1, yAtX1)
		ctx.strokeStyle = ribbonColor
		ctx.lineWidth = r.height
		ctx.lineCap = "round"
		ctx.stroke()
		ctx.restore()
		// текст рисуем только в финальном режиме
		if (!isDraft) {
			const lineAngle = Math.atan2(yAtX1 - yAtX0, x1 - x0)
			ctx.fillStyle = "rgba(255,255,255,0.92)"

			for (let x = x0; x < x1; x += r.step) {
				const y = r.y + slope * (x - w * 0.5)
				ctx.save()
				ctx.translate(x, y)
				ctx.rotate(lineAngle)
				ctx.fillText(text, 0, 0)
				ctx.restore()
			}
		}
	}
	// нижнее затухание (можно оставлять и в draft — дёшево)
	const grad = ctx.createLinearGradient(0, h - fadeH, 0, h)
	grad.addColorStop(0, "rgba(255,255,255,0)")
	grad.addColorStop(1, fadeTo)
	ctx.fillStyle = grad
	ctx.fillRect(0, h - fadeH, w, fadeH)
}

function mulberry32(seed) {
	let a = seed >>> 0
	return function () {
		a |= 0
		a = (a + 0x6D2B79F5) | 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

function clamp(v, a, b) {
	return Math.max(a, Math.min(b, v))
}

function lerp(a, b, t) {
	return a + (b - a) * t
}

// чем меньше w, тем меньше spacing (ленты плотнее)
function ribbonSpacingPx(w) {
	// 360px -> 90px, 1600px -> 220px
	const t = clamp((w - 360) / (1600 - 360), 0, 1)
	return Math.round(lerp(90, 220, t))
}

function makeRibbonsForSize(seed, w, h) {
	const rnd = mulberry32(seed)

	// базовые углы: как в вашем паттерне + один встречный
	const angles = [-22, -16, -12, -18, +14]

	const spacing = ribbonSpacingPx(w)
	const margin = Math.hypot(w, h) * 0.25

	// стартуем выше экрана, чтобы не было пустот
	let y = -margin
	const ribbons = []

	let i = 0
	while (y < h + margin) {
		const aBase = angles[i % angles.length]
		const angleDeg = aBase + (rnd() - 0.5) * 2.0       // небольшой джиттер ±1°
		const height = 28 + (rnd() - 0.5) * 6              // 25..31px
		const yJitter = (rnd() - 0.5) * (spacing * 0.25)   // ±12.5% шага

		ribbons.push({
			y: y + yJitter,
			angleDeg,
			height,
			step: 260,  // шаг повторения текста вдоль ленты
		})

		y += spacing
		i++
	}

	return ribbons
}

document.addEventListener("DOMContentLoaded", () => {
	const section = document.querySelector(".cards")
	if (!section) return

	function redraw(draft) {
		const rect = section.getBoundingClientRect()
		const ribbons = makeRibbonsForSize(123456, rect.width, rect.height)

		drawRibbonBackground(section, {
			ribbons,
			text: "пробный период 1 месяц",
			ribbonColor: "#6B4CFF",
			fadeH: 220,
			fadeTo: "#fff",
			draft
		})
	}

	redraw(false)

	let rafId = 0
	let finalTimer = 0

	window.addEventListener("resize", () => {
		// быстрый кадр во время ресайза
		if (!rafId) {
			rafId = requestAnimationFrame(() => {
				rafId = 0
				redraw(true)
			})
		}

		// финальная “красивая” перерисовка после паузы
		clearTimeout(finalTimer)
		finalTimer = setTimeout(() => redraw(false), 260)
	})
})