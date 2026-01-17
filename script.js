let employeeCounter = 1
let tasksPerMonthCounter = 100
const pricePerMonth = 1000
const pricePerYear = 10000


// --- Economy editable params ---
const ECONOMY_STORAGE_KEY = "uldesk_economy_params_v1"

const economyDefaults = {
	cleanMin: 12,     // “чистое” время решения (мин)
	costPerHour: 800, // ₽/час
	chaosMin: 3.0,    // потери на бардак (мин/обращение) = переключения+поиск контекста+ручной SLA
	dupPct: 8,        // дубли/повторные (%)
	lostPct: 2,       // потерянные/пропущенные (%)
	errPct: 4,        // ошибки/переоткрытия (%)
}

function clampNum(v, min, max) {
	if (!Number.isFinite(v)) return min
	return Math.max(min, Math.min(max, v))
}

function loadEconomyParams() {
	try {
		const raw = localStorage.getItem(ECONOMY_STORAGE_KEY)
		if (!raw) return {...economyDefaults}
		const parsed = JSON.parse(raw)

		return {
			cleanMin: clampNum(Number(parsed.cleanMin), 1, 240),
			costPerHour: clampNum(Number(parsed.costPerHour), 100, 20000),
			chaosMin: clampNum(Number(parsed.chaosMin), 0, 240),
			dupPct: clampNum(Number(parsed.dupPct), 0, 100),
			lostPct: clampNum(Number(parsed.lostPct), 0, 100),
			errPct: clampNum(Number(parsed.errPct), 0, 100),
		}
	} catch (e) {
		return {...economyDefaults}
	}
}

function saveEconomyParams(p) {
	try {
		localStorage.setItem(ECONOMY_STORAGE_KEY, JSON.stringify(p))
	} catch (e) {
		// ignore
	}
}

let economyParams = loadEconomyParams()

function getEconomyOpts() {
	return {
		T: economyParams.cleanMin,
		C: economyParams.costPerHour,
		chaos: economyParams.chaosMin,
		d: economyParams.dupPct / 100,
		l: economyParams.lostPct / 100,
		e: economyParams.errPct / 100,
	}
}


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
	calcHelpdeskTimeSavings(getEconomyOpts())
}

function helpdeskTimeSavingsPlus() {
	tasksPerMonthCounter += 100
	calcHelpdeskTimeSavings(getEconomyOpts())
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
		// потери “ручной омниканальности/бардака” (мин/заявка)
		chaos: 3.0,
		// (3) дубли/повторные обращения
		d: 0.08,      // 8% дублей
		tDup: 10,     // лишние минуты на дубль
		// (4) потерянные/пропущенные обращения
		l: 0.02,      // 2% теряются
		tLost: 30,    // среднее время на восстановление/разбор
		// (5) ошибки/переоткрытия из-за контекста/учёта
		e: 0.04,      // 4% ошибок/переоткрытий
		tErr: 15,     // время на исправление
		// (6) стоимость часа
		C: 800,       // ₽/час
		// --- Эффект внедрения системы (типовые средние) ---
		selfService: 0.10,             // доля обращений, не создающихся из-за базы знаний (10%)
		baseResolutionReduction: 0.10, // ускорение “чистого” решения (10%)
		overheadReduction: 0.60,       // снижение chaos (60%)
		defectReduction: 0.50          // снижение дублей/потерь/ошибок (50%)
	}
	const p = {...defaults, ...opts}
	// Валидация долей 0..1
	for (const k of ["d", "l", "e", "selfService", "baseResolutionReduction", "overheadReduction", "defectReduction"]) {
		if (!Number.isFinite(p[k]) || p[k] < 0 || p[k] > 1) throw new Error(`${k} должно быть числом в диапазоне 0..1`)
	}
	// --- 1) Нагрузка без системы (ручная омниканальность) ---
	const manualMinutes = N * (p.T + p.chaos) + N * p.d * p.tDup + N * p.l * p.tLost + N * p.e * p.tErr
	// --- 2) Нагрузка с системой ---
	// часть обращений “съедает” база знаний (самообслуживание)
	const N_eff = N * (1 - p.selfService)
	const overheadPerTicket = p.chaos * (1 - p.overheadReduction)
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
			overhead_min_per_ticket: p.chaos,
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

	const spacing = ribbonSpacingPx(w) * 1.15
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

function initRibbonMarquee(section, opts = {}) {
	const canvas = section.querySelector(".cards-bg")
	if (!canvas) return

	const isFirefox = /firefox/i.test(navigator.userAgent)

	// В Firefox лучше не разгонять DPR — сильно повышает цену отрисовки
	const DPR_CAP = isFirefox ? 1 : 2

	const text = opts.text ?? "пробный период 1 месяц"
	const font = opts.font ?? "600 14px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial"
	const ribbonColor = opts.ribbonColor ?? "#6B4CFF"
	const fadeH = opts.fadeH ?? 220
	const fadeTo = opts.fadeTo ?? "#fff"
	const speed = opts.speed ?? 42 // px/sec

	const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true })

	// Статичный кэш: ленты/тени/градиент
	const staticCanvas = document.createElement("canvas")
	const sctx = staticCanvas.getContext("2d", { alpha: true, desynchronized: true })

	let w = 0
	let h = 0
	let dpr = 1
	let ribbons = []
	let running = false
	let rafId = 0
	let lastTs = 0
	let offset = 0

	// Ограничение области по X, чтобы не рисовать “бесконечность”
	let x0 = 0
	let x1 = 0
	let len = 0

	function makeTextStrip(stepPx, stripH) {
		// Полоска с повторяющимся текстом (рисуется 1 раз)
		const stripW = 1024
		const c = document.createElement("canvas")
		c.width = stripW
		c.height = stripH
		const cctx = c.getContext("2d", { alpha: true, desynchronized: true })

		cctx.clearRect(0, 0, stripW, stripH)
		cctx.font = font
		cctx.textBaseline = "middle"
		cctx.fillStyle = "rgba(255,255,255,0.92)"

		const y = stripH / 2
		for (let x = 0; x < stripW + stepPx; x += stepPx) {
			cctx.fillText(text, x, y)
		}
		return c
	}

	function buildRibbons() {
		ribbons = makeRibbonsForSize(123456, w, h).map((r, idx) => {
			const angle = (r.angleDeg * Math.PI) / 180
			const slope = Math.tan(angle)

			const yAtX0 = r.y + slope * (x0 - w * 0.5)
			const yAtX1 = r.y + slope * (x1 - w * 0.5)
			const lineAngle = Math.atan2(yAtX1 - yAtX0, x1 - x0)

			// высота текстовой полоски (не обязана равняться высоте ленты)
			const stripH = Math.max(20, Math.round(r.height * 0.7))
			const strip = makeTextStrip(r.step, stripH)

			return {
				...r,
				slope,
				yAtX0,
				yAtX1,
				lineAngle,
				dir: idx % 2 === 0 ? 1 : -1,
				strip,
				stripH,
				stripW: strip.width,
			}
		})
	}

	function resize() {
		const newW = Math.max(1, Math.floor(section.clientWidth))
		const newH = Math.max(1, Math.floor(section.clientHeight))
		if (newW === w && newH === h) return

		w = newW
		h = newH

		dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP)

		canvas.width = Math.floor(w * dpr)
		canvas.height = Math.floor(h * dpr)
		canvas.style.width = w + "px"
		canvas.style.height = h + "px"

		staticCanvas.width = Math.floor(w * dpr)
		staticCanvas.height = Math.floor(h * dpr)

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		sctx.setTransform(dpr, 0, 0, dpr, 0, 0)

		const pad = Math.max(140, Math.floor(Math.hypot(w, h) * 0.22))
		x0 = -pad
		x1 = w + pad
		len = x1 - x0

		buildRibbons()
		drawStatic()
	}

	function drawStatic() {
		sctx.clearRect(0, 0, w, h)

		// ленты + тени (1 раз)
		for (let i = 0; i < ribbons.length; i++) {
			const r = ribbons[i]

			sctx.save()
			sctx.shadowColor = "rgba(0,0,0,0.18)"
			sctx.shadowBlur = 10
			sctx.shadowOffsetX = 0
			sctx.shadowOffsetY = 4

			sctx.beginPath()
			sctx.moveTo(x0, r.yAtX0)
			sctx.lineTo(x1, r.yAtX1)
			sctx.strokeStyle = ribbonColor
			sctx.lineWidth = r.height
			sctx.lineCap = "round"
			sctx.stroke()
			sctx.restore()
		}

		// затухание (1 раз)
		const grad = sctx.createLinearGradient(0, h - fadeH, 0, h)
		grad.addColorStop(0, "rgba(255,255,255,0)")
		grad.addColorStop(1, fadeTo)
		sctx.fillStyle = grad
		sctx.fillRect(0, h - fadeH, w, fadeH)
	}

	function drawFrame(ts) {
		if (!running) return

		// Ограничение FPS ~24 (Firefox заметно легче)
		if (lastTs && ts - lastTs < 55) {
			rafId = requestAnimationFrame(drawFrame)
			return
		}

		const dt = lastTs ? (ts - lastTs) / 1000 : 0
		lastTs = ts
		offset += dt * speed

		// 1) статичный фон из кэша
		ctx.clearRect(0, 0, w, h)
		ctx.drawImage(staticCanvas, 0, 0, w, h)

		// 2) бегущий текст: только drawImage, без fillText
		for (let i = 0; i < ribbons.length; i++) {
			const r = ribbons[i]

			const shift = ((offset * r.dir) % r.stripW + r.stripW) % r.stripW

			ctx.save()
			ctx.translate(x0, r.yAtX0)
			ctx.rotate(r.lineAngle)

			// Рисуем 2-3 “полоски” чтобы закрыть всю длину
			let dx = -shift
			while (dx < len) {
				ctx.drawImage(r.strip, dx, -r.stripH / 2)
				dx += r.stripW
			}

			ctx.restore()
		}

		rafId = requestAnimationFrame(drawFrame)
	}

	function start() {
		if (running) return
		running = true
		lastTs = 0
		rafId = requestAnimationFrame(drawFrame)
	}

	function stop() {
		running = false
		if (rafId) cancelAnimationFrame(rafId)
		rafId = 0
		lastTs = 0
	}

	resize()

	// обновляем только при реальном изменении размеров
	const ro = new ResizeObserver(() => resize())
	ro.observe(section)

	// анимация только когда секция видима
	const io = new IntersectionObserver(
		(entries) => {
			if (entries[0].isIntersecting) start()
			else stop()
		},
		{ threshold: 0.01 }
	)
	io.observe(section)

	// стоп на скрытой вкладке
	document.addEventListener("visibilitychange", () => {
		if (document.hidden) stop()
		else start()
	})

	start()
}

document.addEventListener("DOMContentLoaded", () => {
	document.querySelectorAll(".cards").forEach((section) => {
		initRibbonMarquee(section, {
			text: "пробный период 1 месяц",
			ribbonColor: "#6B4CFF",
			fadeH: 220,
			fadeTo: "#fff",
			speed: 42,
		})
	})
})


function initEconomySettingsUI() {
	const toggle = document.getElementById("economy-settings-toggle")
	const panel = document.getElementById("economy-settings-panel")
	if (!toggle || !panel) return

	const elClean = document.getElementById("eco_clean_min")
	const elCost = document.getElementById("eco_cost_per_hour") // ✅ ДОБАВИТЬ
	const elChaos = document.getElementById("eco_chaos_min")
	const elDup = document.getElementById("eco_dup_pct")
	const elLost = document.getElementById("eco_lost_pct")
	const elErr = document.getElementById("eco_err_pct")
	const btnReset = document.getElementById("eco_reset")

	// если какой-то инпут не найден — выходим (чтобы не ловить ошибки)
	if (!elClean || !elCost || !elChaos || !elDup || !elLost || !elErr) return

	function syncToInputs() {
		elClean.value = String(economyParams.cleanMin)
		elCost.value = String(economyParams.costPerHour) // ✅ ДОБАВИТЬ
		elChaos.value = String(economyParams.chaosMin)
		elDup.value = String(economyParams.dupPct)
		elLost.value = String(economyParams.lostPct)
		elErr.value = String(economyParams.errPct)
	}

	let t = 0

	function recalcDebounced() {
		clearTimeout(t)
		t = setTimeout(() => calcHelpdeskTimeSavings(getEconomyOpts()), 120)
	}

	function readFromInputs() {
		economyParams = {
			cleanMin: clampNum(Number(elClean.value), 1, 240),
			costPerHour: clampNum(Number(elCost.value), 100, 20000), // ✅ ДОБАВИТЬ
			chaosMin: clampNum(Number(elChaos.value), 0, 240),
			dupPct: clampNum(Number(elDup.value), 0, 100),
			lostPct: clampNum(Number(elLost.value), 0, 100),
			errPct: clampNum(Number(elErr.value), 0, 100),
		}
		saveEconomyParams(economyParams)
		recalcDebounced()
	}

	toggle.addEventListener("click", () => {
		const isOpen = !panel.hidden
		panel.hidden = isOpen
		toggle.setAttribute("aria-expanded", String(!isOpen))
		toggle.dataset.open = String(!isOpen)
	});
	[elClean, elCost, elChaos, elDup, elLost, elErr].forEach((el) => { // ✅ elCost теперь существует
		el.addEventListener("input", readFromInputs)
		el.addEventListener("change", readFromInputs)
	})
	if (btnReset) {
		btnReset.addEventListener("click", () => {
			economyParams = {...economyDefaults}
			saveEconomyParams(economyParams)
			syncToInputs()
			calcHelpdeskTimeSavings(getEconomyOpts())
		})
	}
	syncToInputs()
}

document.addEventListener("DOMContentLoaded", () => {
	initEconomySettingsUI()
	calcHelpdeskTimeSavings(getEconomyOpts()) // чтобы цифры сразу соответствовали параметрам
})
