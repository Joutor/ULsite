let employeeCounter = 1
let tasksPerMonthCounter = 100
const pricePerMonth = 1000
const pricePerYear = 833.333
let payMode = "month"

// --- Calc counters storage ---
const CALC_STATE_KEY = "uldesk_calc_state_v1"

function saveCalcState() {
	try {
		localStorage.setItem(CALC_STATE_KEY, JSON.stringify({
			employeeCounter,
			tasksPerMonthCounter,
			payMode,
		}))
	} catch (e) {
	}
}

function loadCalcState() {
	try {
		const raw = localStorage.getItem(CALC_STATE_KEY)
		if (!raw) return
		const st = JSON.parse(raw)

		if (Number.isFinite(+st.employeeCounter)) {
			employeeCounter = Math.max(1, Math.floor(+st.employeeCounter))
		}
		if (Number.isFinite(+st.tasksPerMonthCounter)) {
			const v = Math.floor(+st.tasksPerMonthCounter)
			tasksPerMonthCounter = Math.max(100, v)
		}
		if (st.payMode === "month" || st.payMode === "year") {
			payMode = st.payMode
		}
	} catch (e) {
	}
}


// --- Economy editable params ---
const ECONOMY_STORAGE_KEY = "uldesk_economy_params_v1"

const economyDefaults = {
	cleanMin: 12,      // “чистое” время решения (мин)
	costPerHour: 800,  // ₽/час
	chaosMin: 3.0,     // потери на бардак (мин/обращение) = переключения+поиск контекста+ручной SLA
	lostCases: 9,      // потерянные/пропущенные (случаев/мес)
	dupCases: 16,      // повторные обращения (случаев/мес)
	errCases: 13,      // ошибки/переоткрытия (случаев/мес)
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
		// N нужен только для совместимости со старым форматом в процентах
		const N = Math.max(1, tasksPerMonthCounter * employeeCounter)

		const pctToCases = (pct) => (N * Number(pct)) / 100

		return {
			cleanMin: clampNum(Number(parsed.cleanMin ?? economyDefaults.cleanMin), 1, 240),
			costPerHour: clampNum(Number(parsed.costPerHour ?? economyDefaults.costPerHour), 100, 20000),
			chaosMin: clampNum(Number(parsed.chaosMin ?? economyDefaults.chaosMin), 0, 240),

			// Новая логика: случаи/мес (и совместимость со старым форматом %)
			lostCases: clampNum(Number(
				parsed.lostCases ??
				(parsed.lostPct != null ? pctToCases(parsed.lostPct) : economyDefaults.lostCases)
			), 0, 1000000),

			dupCases: clampNum(Number(
				parsed.dupCases ??
				(parsed.dupPct != null ? pctToCases(parsed.dupPct) : economyDefaults.dupCases)
			), 0, 1000000),

			errCases: clampNum(Number(
				parsed.errCases ??
				(parsed.errPct != null ? pctToCases(parsed.errPct) : economyDefaults.errCases)
			), 0, 1000000),
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
		lostCount: economyParams.lostCases,
		dupCount: economyParams.dupCases,
		errCount: economyParams.errCases,
	}
}

function employeeCounterPlus() {
	employeeCounter += 1
	updateEmployeeCounters()
	saveCalcState()
	calcHelpdeskTimeSavings(getEconomyOpts())
}

function employeeCounterMinus() {
	employeeCounter -= 1
	if (employeeCounter <= 0) {
		employeeCounter = 1
	}
	updateEmployeeCounters()
	saveCalcState()
	calcHelpdeskTimeSavings(getEconomyOpts())
}

function updateEmployeeCounters() {
	const employeesEl = document.getElementById("employees")
	if (employeesEl) employeesEl.value = String(employeeCounter)

	const priceEl = document.getElementById("price")
	if (priceEl) {
		const unit = (payMode === "year") ? (pricePerYear).toFixed(0) : (pricePerMonth).toFixed(0)
		const now = unit * employeeCounter

		if (payMode === "year") {
			const old = pricePerMonth * employeeCounter
			priceEl.innerHTML =
				`${formatThousandsSpaces(now)} ₽` +
				`<span style="display:block;margin-top:6px;font:400 18px/1 Inter,system-ui;color:#A7A3BA;text-decoration:line-through;">` +
				`${formatThousandsSpaces(old)} ₽` +
				`</span>`
		} else {
			priceEl.innerHTML = `${formatThousandsSpaces(now)} ₽`
		}
	}
}

function helpdeskTimeSavingsPlus() {
	tasksPerMonthCounter += 100
	saveCalcState()
	calcHelpdeskTimeSavings(getEconomyOpts())
}

function helpdeskTimeSavingsMinus() {
	tasksPerMonthCounter -= 100
	if (tasksPerMonthCounter <= 0) {
		tasksPerMonthCounter = 100
	}
	saveCalcState()
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
	let N = tasksPerMonthCounter * employeeCounter
	document.getElementById("tickets").value = String(tasksPerMonthCounter)
	if (!Number.isFinite(N) || N < 0) throw new Error("N (заявок/мес) должно быть неотрицательным числом")
	// --- Средние значения (пункты 2–6 + доп. параметры модели) ---
	const defaults = {
		// (2) среднее “чистое” время решения заявки (мин)
		T: 12,
		// потери “ручной омниканальности/бардака” (мин/заявка)
		chaos: 3.0,
		// дефекты по умолчанию заданы долями, но в UI вводятся СЛУЧАИ/МЕС
		dRate: 0.08,  // повторные обращения (8% от потока)
		tDup: 10,     // лишние минуты на повторное обращение
		lRate: 0.02,  // потерянные/пропущенные (2%)
		tLost: 30,    // время на восстановление/разбор
		eRate: 0.04,  // ошибки/переоткрытия (4%)
		tErr: 15,     // время на исправление
		// (6) стоимость часа
		C: 800,       // ₽/час
		// --- Эффект внедрения системы ---
		selfService: 0.10,
		baseResolutionReduction: 0.10,
		overheadReduction: 0.60,
		defectReduction: 0.50,
	}
	const p = {...defaults, ...opts}

	function clampCount(v, min, max) {
		if (!Number.isFinite(v)) return min
		return Math.max(min, Math.min(max, v))
	}

	// Валидация долей 0..1 (только эффекты внедрения)
	for (const k of ["selfService", "baseResolutionReduction", "overheadReduction", "defectReduction"]) {
		if (!Number.isFinite(p[k]) || p[k] < 0 || p[k] > 1) throw new Error(`${k} должно быть числом в диапазоне 0..1`)
	}

	// В UI теперь вводится не %, а количество случаев в месяц
	const dupCount = clampCount(Number(p.dupCount ?? (N * p.dRate)), 0, N)
	const lostCount = clampCount(Number(p.lostCount ?? (N * p.lRate)), 0, N)
	const errCount = clampCount(Number(p.errCount ?? (N * p.eRate)), 0, N)

	// пересчёт в доли нужен только для отображения/assumptions
	const d = N > 0 ? dupCount / N : 0
	const l = N > 0 ? lostCount / N : 0
	const e = N > 0 ? errCount / N : 0

	for (const k of ["selfService", "baseResolutionReduction", "overheadReduction", "defectReduction"]) {
		if (!Number.isFinite(p[k]) || p[k] < 0 || p[k] > 1) throw new Error(`${k} должно быть числом в диапазоне 0..1`)
	}
	// --- 1) Нагрузка без системы (ручная омниканальность) ---
	const manualMinutes = N * (p.T + p.chaos) + dupCount * p.tDup + lostCount * p.tLost + errCount * p.tErr
	// --- 2) Нагрузка с системой ---
	// часть обращений “съедает” база знаний (самообслуживание)
	const N_eff = N * (1 - p.selfService)
	const overheadPerTicket = p.chaos * (1 - p.overheadReduction)
	const baseT = p.T * (1 - p.baseResolutionReduction)
	const scale = N > 0 ? (N_eff / N) : 0
	const dupCount_eff = dupCount * scale * (1 - p.defectReduction)
	const lostCount_eff = lostCount * scale * (1 - p.defectReduction)
	const errCount_eff = errCount * scale * (1 - p.defectReduction)
	const withSystemMinutes =
		N_eff * (baseT + overheadPerTicket) +
		dupCount_eff * p.tDup +
		lostCount_eff * p.tLost +
		errCount_eff * p.tErr
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
			rates: {d, l, e},
			counts_per_month: {dupCount, lostCount, errCount},
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
	const hours = Math.round(savedHours);
	document.getElementById("economyTime").innerHTML = `≈ ${formatThousandsSpaces(hours)} ${pluralizeHours(hours)}`;
	document.getElementById("economyFte").innerHTML = `≈ ${savedFTE.toFixed(1)} FTE`
	const costMonth = employeeCounter * pricePerMonth
	const costYear = employeeCounter * pricePerYear

	const netMonth = Math.max(0, savedRub - costMonth)
	const netYear = Math.max(0, savedRub - costYear)

	const economyMoneyEl = document.getElementById("economyMoney")
	if (economyMoneyEl) {
		if (payMode === "year") {
			economyMoneyEl.innerHTML =
				`≈ ${formatThousandsSpaces(netYear.toFixed(0))} ₽` +
				`<span style="display:block;margin-top:6px;font:400 18px/1 Inter,system-ui;color:#A7A3BA;text-decoration:line-through;">` +
				`≈ ${formatThousandsSpaces(netMonth.toFixed(0))} ₽` +
				`</span>`
		} else {
			economyMoneyEl.innerHTML = `≈ ${formatThousandsSpaces(netMonth.toFixed(0))} ₽`
		}
	}
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

function pluralizeHours(n) {
	n = Math.abs(n) % 100;
	const n1 = n % 10;

	if (n > 10 && n < 20) return "часов";
	if (n1 === 1) return "час";
	if (n1 >= 2 && n1 <= 4) return "часа";
	return "часов";
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

	const ctx = canvas.getContext("2d", {alpha: true, desynchronized: true})

	// Статичный кэш: ленты/тени/градиент
	const staticCanvas = document.createElement("canvas")
	const sctx = staticCanvas.getContext("2d", {alpha: true, desynchronized: true})

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
		const cctx = c.getContext("2d", {alpha: true, desynchronized: true})

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
		{threshold: 0.01}
	)
	io.observe(section)

	// стоп на скрытой вкладке
	document.addEventListener("visibilitychange", () => {
		if (document.hidden) stop()
		else start()
	})

	start()
}

function initEconomySettingsUI() {
	const toggle = document.getElementById("paramsToggle")
	const panel = document.getElementById("calcParams")
	if (!toggle || !panel) return

	const inputs = panel.querySelectorAll("input.stepper-input")
	if (inputs.length < 6) return

	// порядок как в твоём HTML:
	// 0 costPerHour, 1 cleanMin, 2 chaosMin, 3 lostCases, 4 dupCases, 5 errCases
	const elCost = inputs[0]
	const elClean = inputs[1]
	const elChaos = inputs[2]
	const elLost = inputs[3]
	const elDup = inputs[4]
	const elErr = inputs[5]

	function clampNum(v, min, max) {
		if (!Number.isFinite(v)) return min
		return Math.max(min, Math.min(max, v))
	}

	function syncUI() {
		elClean.value = String(economyParams.cleanMin)
		elCost.value = String(economyParams.costPerHour)
		elChaos.value = String(economyParams.chaosMin)
		elDup.value = String(economyParams.dupCases)
		elLost.value = String(economyParams.lostCases)
		elErr.value = String(economyParams.errCases)
	}

	let t = 0

	function recalcDebounced() {
		clearTimeout(t)
		t = setTimeout(() => calcHelpdeskTimeSavings(getEconomyOpts()), 120)
	}

	function readFromUIAndRecalc() {
		economyParams = {
			cleanMin: clampNum(Number(elClean.value), 1, 240),
			costPerHour: clampNum(Number(elCost.value), 100, 50000),
			chaosMin: clampNum(Number(elChaos.value), 0, 120),
			dupCases: clampNum(Number(elDup.value), 0, 1000000),
			lostCases: clampNum(Number(elLost.value), 0, 1000000),
			errCases: clampNum(Number(elErr.value), 0, 1000000),
		}
		saveEconomyParams(economyParams)
		recalcDebounced()
	}

	// Ввод руками
	;[elClean, elCost, elChaos, elDup, elLost, elErr].forEach((el) => {
		el.addEventListener("input", readFromUIAndRecalc)
	})

	// Кнопки +/- в параметрах
	const steppers = panel.querySelectorAll(".stepper.stepper-small")
	const steps = [
		{step: 50, min: 100, max: 50000}, // costPerHour
		{step: 1, min: 1, max: 240},   // cleanMin
		{step: 1, min: 0, max: 120},   // chaosMin
		{step: 1, min: 0, max: 1000000},   // lostCases
		{step: 1, min: 0, max: 1000000},   // dupCases
		{step: 1, min: 0, max: 1000000},   // errCases
	]

	steppers.forEach((stepper, idx) => {
		const minus = stepper.querySelector('button[aria-label="Уменьшить"]')
		const plus = stepper.querySelector('button[aria-label="Увеличить"]')
		const input = stepper.querySelector("input.stepper-input")
		if (!minus || !plus || !input) return

		const {step, min, max} = steps[idx] || {step: 1, min: 0, max: 999999}

		minus.addEventListener("click", () => {
			const v = clampNum(Number(input.value), min, max)
			input.value = String(clampNum(v - step, min, max))
			readFromUIAndRecalc()
		})

		plus.addEventListener("click", () => {
			const v = clampNum(Number(input.value), min, max)
			input.value = String(clampNum(v + step, min, max))
			readFromUIAndRecalc()
		})
	})

	// Показать/скрыть параметры
	toggle.addEventListener("click", () => {
		const isOpen = panel.classList.toggle("open")
		toggle.setAttribute("aria-expanded", String(isOpen))
		panel.setAttribute("aria-hidden", String(!isOpen))
		toggle.textContent = isOpen ? "Скрыть параметры" : "Показать параметры"
		if (isOpen) {
			syncUI()
			// авто-высота, чтобы не резалось на мобилке
			panel.style.maxHeight = panel.scrollHeight + "px"
		} else {
			panel.style.maxHeight = "0px"
		}
	})
	// если экран повернули или изменилась ширина — пересчитать высоту
	window.addEventListener("resize", () => {
		if (panel.classList.contains("open")) {
			panel.style.maxHeight = panel.scrollHeight + "px"
		}
	})
	// старт
	syncUI()
}

(function () {
	const seg = document.querySelector('.pay-seg');
	if (!seg) return;

	const buttons = Array.from(seg.querySelectorAll('button[role="tab"]'));

	function setActive(btn) {
		buttons.forEach(b => {
			const isActive = b === btn;
			b.classList.toggle('active', isActive);
			b.setAttribute('aria-selected', isActive ? 'true' : 'false');
		});

		// Если захочешь дальше считать цены — тут уже есть выбранный режим:
		// const payMode = btn.dataset.pay; // "month" | "year"
	}

	buttons.forEach(btn => {
		btn.addEventListener('click', () => setActive(btn));
	});
})();

(() => {
	const obj = document.querySelector('.big-head-svg');
	if (!obj) return;

	let doc, eyes, mustache;

	const state = {
		tx: 0, ty: 0, // текущие значения (сглаженные)
		x: 0, y: 0  // целевые значения
	};

	const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
	const lerp = (a, b, t) => a + (b - a) * t;

	// настройка амплитуды (можешь подкрутить)
	const AMP = {
		eyesX: 10,
		eyesY: 6,
		mustX: 6,
		mustY: 3
	};

	function apply() {
		state.tx = lerp(state.tx, state.x, 0.12);
		state.ty = lerp(state.ty, state.y, 0.12);

		if (eyes) {
			eyes.setAttribute('transform', `translate(${state.tx * AMP.eyesX} ${state.ty * AMP.eyesY})`);
		}
		if (mustache) {
			mustache.setAttribute('transform', `translate(${state.tx * AMP.mustX} ${state.ty * AMP.mustY})`);
		}

		requestAnimationFrame(apply);
	}

	function onMove(e) {
		// нормализация по ВСЕМУ экрану: -1..1
		const nx = (e.clientX / window.innerWidth - 0.5) * 2;
		const ny = (e.clientY / window.innerHeight - 0.5) * 2;

		state.x = clamp(nx, -1, 1);
		state.y = clamp(ny, -1, 1);
	}

	function onLeaveWindow() {
		state.x = 0;
		state.y = 0;
	}

	obj.addEventListener('load', () => {
		doc = obj.contentDocument;
		if (!doc) return;

		eyes = doc.getElementById('bighead-eyes');
		mustache = doc.getElementById('bighead-mustache');

		if (!eyes && !mustache) return;

		window.addEventListener('mousemove', onMove, {passive: true});
		window.addEventListener('blur', onLeaveWindow);

		requestAnimationFrame(apply);
	});
})();


(() => {
	const orbit = document.querySelector('.welcome-orbit');
	if (!orbit) return;

	const channels = Array.from(orbit.querySelectorAll('.welcome-channel'));

	// скорость (градусов в секунду)
	const SPEED = 14;

	// форма овала: больше по X = шире, меньше по Y = ниже
	const OVAL_X = 0.86; // ширина орбиты
	const OVAL_Y = 1.22; // высота орбиты

	let start = null;

	function tick(t) {
		if (start === null) start = t;
		const sec = (t - start) / 1000;
		const deg = (sec * SPEED) % 360;

		// ОВАЛ: сначала "сплющиваем", потом вращаем
		orbit.style.transform = `scaleX(${OVAL_X}) scaleY(${OVAL_Y}) rotate(${deg}deg)`;

		// Чтобы иконки не растягивались и не крутились — даём им обратный трансформ
		const CHANNEL_SCALE = 2;
		const inv = `rotate(${-deg}deg) scaleX(${1 / OVAL_X}) scaleY(${1 / OVAL_Y}) scale(${CHANNEL_SCALE})`;
		for (const ch of channels) ch.style.transform = inv;

		requestAnimationFrame(tick);
	}

	requestAnimationFrame(tick);
})();

(function initToolsHoverCard() {
	const items = Array.from(document.querySelectorAll(".tool-item[data-tool]"));
	const toolsGrid = document.querySelector(".tools-grid");
	const toolsLeft = document.querySelector(".tools-left");
	const card = document.getElementById("toolCard");
	const titleEl = document.getElementById("toolCardTitle");
	const descEl = document.getElementById("toolCardDesc");
	const mediaEl = document.getElementById("toolCardMedia");

	if (!items.length || !toolsGrid || !toolsLeft || !card || !titleEl || !descEl || !mediaEl) return;

	const content = {
		automation: {
			title: "Автоматические ответы на часто задаваемые вопросы",
			desc: "Настройте шаблоны ответов, триггеры и макросы — система будет помогать оператору отвечать быстрее и точнее.",
			img: "/img/automation.jpg"
		},
		priority: {
			title: "Подсветка приоритетов и сроков",
			desc: "Просроченные и срочные заявки видны сразу: проще контролировать SLA и не пропускать важное.",
			img: "/img/sla.jpg"
		},
		filters: {
			title: "Гибкие фильтры и сортировки",
			desc: "Быстро находите нужные заявки по статусам, приоритетам, исполнителям и тегам.",
			img: "/img/filters.jpg"
		},
		chat: {
			title: "Чат операторов внутри каждой заявки",
			desc: "Обсуждайте решение внутри заявки, не теряя контекст и историю обращения.",
			img: "/img/in_task_chat.jpg"
		},
		request: {
			title: "Заявка-ориентированная система",
			desc: "Один клиент — много заявок. Процесс поддержки становится структурным и масштабируемым.",
			img: "/img/chat-tasks.jpg"
		}
	};

	const AUTO_MS = 10000;

	let activeKey = items.find(i => i.classList.contains("active"))?.dataset.tool || items[0].dataset.tool;
	let switchTimer = 0;
	let autoTimer = 0;
	let pendingKey = activeKey;

	// На мобилке карточка должна быть ПОД выбранной строкой.
	// На десктопе — справа как сейчас.
	const mqMobile = window.matchMedia("(max-width: 620px)");

	function placeCardUnderActiveRow() {
		const activeEl = toolsLeft.querySelector(".tool-item.active") || items[0];
		if (!activeEl) return;

		if (mqMobile.matches) {
			if (card.parentNode !== toolsLeft || card.previousElementSibling !== activeEl) {
				toolsLeft.insertBefore(card, activeEl.nextElementSibling);
			}
		} else {
			if (card.parentNode !== toolsGrid || card.previousElementSibling !== toolsLeft) {
				toolsGrid.appendChild(card);
			}
		}
	}

	function restartDotTimer() {
		items.forEach(el => {
			const dot = el.querySelector(".tool-dot");
			if (!dot) return;

			dot.classList.remove("timer-run");
			// форсим перезапуск анимации
			void dot.offsetWidth;

			if (el.classList.contains("active")) {
				dot.classList.add("timer-run");
			}
		});
	}

	function scheduleAuto(currentKey) {
		if (autoTimer) clearTimeout(autoTimer);

		autoTimer = setTimeout(() => {
			const idx = items.findIndex(i => i.dataset.tool === currentKey);
			const next = items[(idx + 1) % items.length];
			setActive(next.dataset.tool, true);
		}, AUTO_MS);
	}

	function setActive(key, fromAuto = false) {
		if (!content[key]) return;

		pendingKey = key;

		// подсветка слева сразу
		items.forEach(el => el.classList.toggle("active", el.dataset.tool === key));
		placeCardUnderActiveRow();

		// перезапуск таймера-полоски и автопереключения
		restartDotTimer();
		scheduleAuto(key);

		// если это уже активный — просто перезапустили таймер и выходим
		if (key === activeKey) return;

		if (switchTimer) clearTimeout(switchTimer);

		// 1) запускаем плавное исчезновение
		card.classList.add("is-changing");
		switchTimer = window.setTimeout(() => {
			if (pendingKey !== key) return;

			titleEl.textContent = content[key].title;
			descEl.textContent = content[key].desc;
			mediaEl.innerHTML = `<img src="${content[key].img}" alt="" loading="lazy">`;

			requestAnimationFrame(() => {
				card.classList.remove("is-changing");
			});

			activeKey = key;
			switchTimer = 0;
		}, 140);
	}
	// выставим начальное значение
	const initial = content[activeKey] ? activeKey : items[0].dataset.tool;
	titleEl.textContent = content[initial].title;
	descEl.textContent = content[initial].desc;
	placeCardUnderActiveRow();

	// Только клик (убрали hover)
	items.forEach(el => {
		el.addEventListener("click", () => setActive(el.dataset.tool));
	});

	// Запускаем таймер и автопереключение на старте
	restartDotTimer();
	scheduleAuto(activeKey);

	// если пользователь повернул экран / изменил ширину
	if (mqMobile.addEventListener) {
		mqMobile.addEventListener("change", placeCardUnderActiveRow);
	} else if (mqMobile.addListener) {
		mqMobile.addListener(placeCardUnderActiveRow);
	}
})();

document.addEventListener("DOMContentLoaded", () => {
	// Защита от двойной инициализации (на мобилках/при дубле скриптов кнопки могли срабатывать 2 раза)
	if (window.__uldesk_landing_dom_inited) {
	} else {
		window.__uldesk_landing_dom_inited = true
	}

	const burgerBtn = document.getElementById("burgerBtn");
	const mobileMenu = document.getElementById("mobileMenu");
	const header = document.querySelector("header");

	if (burgerBtn && mobileMenu && header) {
		burgerBtn.addEventListener("click", () => {
			header.classList.toggle("is-open");
		});

		// закрытие по клику вне меню
		document.addEventListener("click", (e) => {
			const menu = document.getElementById("mobileMenu");
			const burger = document.getElementById("burgerBtn");
			if (!menu || !burger) return;

			const clickedMenu = menu.contains(e.target);
			const clickedBurger = burger.contains(e.target);

			if (!clickedMenu && !clickedBurger) {
				header.classList.remove("is-open");
			}
		});

		// закрыть после клика по пункту
		mobileMenu.querySelectorAll("a").forEach((a) => {
			a.addEventListener("click", () => header.classList.remove("is-open"));
		});
	}

	document.querySelectorAll(".cards").forEach((section) => {
		initRibbonMarquee(section, {
			text: "пробный период 1 месяц",
			ribbonColor: "#6B4CFF",
			fadeH: 220,
			fadeTo: "#fff",
			speed: 42,
		})
	})
	initEconomySettingsUI()

	// --- Сотрудники: + / -
	const empInput = document.getElementById("employees")
	if (empInput) {
		const empStepper = empInput.closest(".stepper")
		if (empStepper) {
			const btnMinus = empStepper.querySelector('button[aria-label="Уменьшить"]')
			const btnPlus = empStepper.querySelector('button[aria-label="Увеличить"]')
			if (btnMinus) btnMinus.addEventListener("click", employeeCounterMinus)
			if (btnPlus) btnPlus.addEventListener("click", employeeCounterPlus)
		}
		// --- ручной ввод сотрудников
		empInput.setAttribute("inputmode", "numeric")
		empInput.setAttribute("pattern", "[0-9]*")
		empInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault()
				empInput.blur()
			}
		})
		empInput.addEventListener("input", () => {
			const raw = String(empInput.value || "")
			const cleaned = raw.replace(/[^0-9]/g, "")
			if (cleaned !== raw) empInput.value = cleaned
			if (!cleaned) return
			employeeCounter = clampNum(Math.floor(+cleaned), 1, 9999)
			updateEmployeeCounters()
			saveCalcState()
			calcHelpdeskTimeSavings(getEconomyOpts())
		})
		empInput.addEventListener("blur", () => {
			if (!String(empInput.value || "").trim()) {
				empInput.value = String(employeeCounter)
			}
		})

	}

	// --- Заявки: + / - (шаг 100 как в старой логике)
	const tInput = document.getElementById("tickets")
	if (tInput) {
		const tStepper = tInput.closest(".stepper")
		if (tStepper) {
			const btnMinus = tStepper.querySelector('button[aria-label="Уменьшить"]')
			const btnPlus = tStepper.querySelector('button[aria-label="Увеличить"]')
			if (btnMinus) btnMinus.addEventListener("click", helpdeskTimeSavingsMinus)
			if (btnPlus) btnPlus.addEventListener("click", helpdeskTimeSavingsPlus)
		}
		// --- ручной ввод заявок
		tInput.setAttribute("inputmode", "numeric")
		tInput.setAttribute("pattern", "[0-9]*")
		tInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault()
				tInput.blur()
			}
		})
		tInput.addEventListener("input", () => {
			const raw = String(tInput.value || "")
			const cleaned = raw.replace(/[^0-9]/g, "")
			if (cleaned !== raw) tInput.value = cleaned
			if (!cleaned) return
			tasksPerMonthCounter = clampNum(Math.floor(+cleaned), 100, 100000000)
			saveCalcState()
			calcHelpdeskTimeSavings(getEconomyOpts())
		})
		tInput.addEventListener("blur", () => {
			if (!String(tInput.value || "").trim()) {
				tInput.value = String(tasksPerMonthCounter)
			}
		})

	}

	// --- Оплата: месяц / год
	const paySeg = document.querySelector(".pay-seg")
	const payMonth = document.getElementById("payMonth")
	const payYear = document.getElementById("payYear")

	function applyPayMode(mode) {
		payMode = mode

		if (paySeg) {
			paySeg.querySelectorAll("button").forEach(b => {
				const m = b.dataset.pay || (b.id === "payYear" ? "year" : (b.id === "payMonth" ? "month" : null))
				if (!m) return
				b.classList.toggle("active", m === mode)
			})
		} else {
			if (payMonth) payMonth.classList.toggle("active", mode === "month")
			if (payYear) payYear.classList.toggle("active", mode === "year")
		}
		updateEmployeeCounters()
		calcHelpdeskTimeSavings(getEconomyOpts())
	}

	// клик по сегменту (работает даже если нажали на span внутри кнопки)
	if (paySeg) {
		paySeg.addEventListener("click", (e) => {
			const btn = e.target.closest("button")
			if (!btn || !paySeg.contains(btn)) return

			const mode = btn.dataset.pay || (btn.id === "payYear" ? "year" : "month")
			applyPayMode(mode)
		})
	}

	// страховка на прямые клики по id (только если нет делегирования через .pay-seg)
	if (!paySeg) {
		if (payMonth) payMonth.addEventListener("click", () => applyPayMode("month"))
		if (payYear) payYear.addEventListener("click", () => applyPayMode("year"))
	}

	// CTA (пересчёт по нажатию)
	const calcBtn = document.getElementById("calcBtn")
	if (calcBtn) {
		calcBtn.addEventListener("click", () => {
			calcHelpdeskTimeSavings(getEconomyOpts())
		})
	}

	// стартовые значения
	loadCalcState()

// применить payMode визуально
	if (payMonth && payYear) {
		payMonth.classList.toggle("active", payMode === "month")
		payYear.classList.toggle("active", payMode === "year")
	}

	updateEmployeeCounters()
	calcHelpdeskTimeSavings(getEconomyOpts())
})