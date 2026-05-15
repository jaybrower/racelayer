import type { IRacingTelemetry, DriverInfo, CarTelemetry } from './telemetry.js'

const PLAYER_CAR_IDX = 5
const LAP_TIME_BASE = 92.4 // seconds
const NUM_CARS = 20

const MOCK_DRIVERS: DriverInfo[] = [
  { carIdx: 0,  userName: 'Carter, Blake',    iRating: 4821, safetyRating: 'A 4.52', carNumber: '07', carName: 'Porsche 992 GT3 Cup', isAI: false },
  { carIdx: 1,  userName: 'Nguyen, Tyler',    iRating: 3940, safetyRating: 'A 2.91', carNumber: '14', carName: 'Porsche 992 GT3 Cup', isAI: false },
  { carIdx: 2,  userName: 'Ramirez, Sofia',   iRating: 5103, safetyRating: 'A 4.88', carNumber: '22', carName: 'Porsche 992 GT3 Cup', isAI: false },
  { carIdx: 3,  userName: 'Johansson, Erik',  iRating: 2874, safetyRating: 'B 3.14', carNumber: '33', carName: 'Porsche 992 GT3 Cup', isAI: false },
  { carIdx: 4,  userName: 'Patel, Arjun',     iRating: 4512, safetyRating: 'A 3.67', carNumber: '44', carName: 'Porsche 992 GT3 Cup', isAI: false },
  { carIdx: 5,  userName: 'Brower, Josiah',   iRating: 3201, safetyRating: 'B 4.10', carNumber: '55', carName: 'Porsche 992 GT3 Cup', isAI: false }, // player
  { carIdx: 6,  userName: 'Okafor, Chidi',    iRating: 3688, safetyRating: 'A 2.33', carNumber: '66', carName: 'Porsche 992 GT3 Cup', isAI: false },
  { carIdx: 7,  userName: 'Müller, Hans',     iRating: 4234, safetyRating: 'A 4.01', carNumber: '77', carName: 'Porsche 992 GT3 Cup', isAI: false },
  { carIdx: 8,  userName: 'Silva, Bruno',     iRating: 2156, safetyRating: 'B 2.88', carNumber: '88', carName: 'Porsche 992 GT3 Cup', isAI: false },
  { carIdx: 9,  userName: 'Kim, Ji-ho',       iRating: 3901, safetyRating: 'A 3.55', carNumber: '9',  carName: 'Porsche 992 GT3 Cup', isAI: false },
  { carIdx: 10, userName: 'Kowalski, Marek',  iRating: 4677, safetyRating: 'A 4.71', carNumber: '10', carName: 'Porsche 992 GT3 Cup', isAI: false },
  { carIdx: 11, userName: 'Fernandez, Luis',  iRating: 1988, safetyRating: 'C 3.22', carNumber: '11', carName: 'Porsche 992 GT3 Cup', isAI: false },
  { carIdx: 12, userName: 'Thompson, Sarah',  iRating: 3344, safetyRating: 'A 1.98', carNumber: '12', carName: 'Porsche 992 GT3 Cup', isAI: false },
  { carIdx: 13, userName: 'Dubois, Pierre',   iRating: 5401, safetyRating: 'A 4.99', carNumber: '13', carName: 'Porsche 992 GT3 Cup', isAI: false },
  { carIdx: 14, userName: 'Andrews, James',   iRating: 2799, safetyRating: 'B 3.77', carNumber: '15', carName: 'Porsche 992 GT3 Cup', isAI: false },
  { carIdx: 15, userName: 'Rossi, Marco',     iRating: 4102, safetyRating: 'A 4.22', carNumber: '16', carName: 'Porsche 992 GT3 Cup', isAI: false },
  { carIdx: 16, userName: 'Chen, Wei',        iRating: 3567, safetyRating: 'A 2.66', carNumber: '17', carName: 'Porsche 992 GT3 Cup', isAI: false },
  { carIdx: 17, userName: 'Petrov, Alexei',   iRating: 4890, safetyRating: 'A 4.44', carNumber: '18', carName: 'Porsche 992 GT3 Cup', isAI: false },
  { carIdx: 18, userName: 'Nakamura, Yuki',   iRating: 3123, safetyRating: 'B 3.91', carNumber: '19', carName: 'Porsche 992 GT3 Cup', isAI: false },
  { carIdx: 19, userName: 'O\'Brien, Sean',   iRating: 2445, safetyRating: 'B 2.11', carNumber: '20', carName: 'Porsche 992 GT3 Cup', isAI: false },
]

// Starting track positions (lapDistPct) for each car, spread around the track
const START_POSITIONS = Array.from({ length: NUM_CARS }, (_, i) => ({
  carIdx: i,
  lapDistPct: (i / NUM_CARS + (Math.random() * 0.01 - 0.005)) % 1,
  startPos: i + 1,
}))

type TireArr = [number, number, number]

interface MockState {
  tick: number
  lapDistPcts: number[]
  currentLap: number[]
  lapTimes: number[][]   // last few lap times per car
  playerRpm: number
  playerRpmDir: number
  playerThrottle: number
  playerBrake: number
  playerGear: number
  playerSpeed: number
  playerFuelLevel: number
  sessionType: 'practice' | 'qualifying' | 'race'
  // Tire temps °C [inner, mid, outer]
  tireLF: TireArr
  tireRF: TireArr
  tireLR: TireArr
  tireRR: TireArr
}

function buildState(): MockState {
  return {
    tick: 0,
    lapDistPcts: START_POSITIONS.map(p => p.lapDistPct),
    currentLap: Array(NUM_CARS).fill(1),
    lapTimes: Array.from({ length: NUM_CARS }, () => []),
    playerRpm: 4000,
    playerRpmDir: 1,
    playerThrottle: 0.82,
    playerBrake: 0,
    playerGear: 4,
    playerSpeed: 38, // m/s ~ 85 mph
    playerFuelLevel: 28.4,
    sessionType: 'race',
    // Typical mid-stint temps: fronts run slightly hotter, inner edges warmer
    tireLF: [84, 81, 78],
    tireRF: [78, 81, 84],
    tireLR: [76, 78, 80],
    tireRR: [80, 78, 76],
  }
}

export function createMockPoller() {
  const state = buildState()

  function setSessionType(type: 'practice' | 'qualifying' | 'race') {
    state.sessionType = type
  }

  function next(): IRacingTelemetry {
    state.tick++
    const dt = 0.1 // 100ms per tick

    // Advance each car around the track
    for (let i = 0; i < NUM_CARS; i++) {
      // Slight speed variation per car based on iRating (higher = slightly faster)
      const irBonus = (MOCK_DRIVERS[i].iRating - 3000) / 100000
      const lapSpeed = 1 / (LAP_TIME_BASE - irBonus * 10)
      state.lapDistPcts[i] = (state.lapDistPcts[i] + lapSpeed * dt) % 1
      if (state.lapDistPcts[i] < lapSpeed * dt) {
        // Crossed start/finish
        const lapTime = LAP_TIME_BASE + (Math.random() * 0.8 - 0.4)
        state.lapTimes[i].push(lapTime)
        if (state.lapTimes[i].length > 10) state.lapTimes[i].shift()
        state.currentLap[i]++
      }
    }

    // Animate player gauges
    state.playerRpm += state.playerRpmDir * 80
    if (state.playerRpm > 7200) state.playerRpmDir = -1
    if (state.playerRpm < 3800) state.playerRpmDir = 1
    state.playerThrottle = Math.max(0, Math.min(1, state.playerThrottle + (Math.random() * 0.1 - 0.05)))
    state.playerBrake = state.playerThrottle < 0.3 ? Math.random() * 0.6 : 0
    state.playerFuelLevel = Math.max(0, state.playerFuelLevel - 0.0006)

    // Slowly drift tire temps toward equilibrium with small noise
    const driftTire = (arr: TireArr, eq: TireArr): TireArr =>
      arr.map((t, i) => Math.max(20, Math.min(130,
        t + (eq[i] - t) * 0.002 + (Math.random() * 0.4 - 0.2)
      ))) as unknown as TireArr
    state.tireLF = driftTire(state.tireLF, [84, 81, 78])
    state.tireRF = driftTire(state.tireRF, [78, 81, 84])
    state.tireLR = driftTire(state.tireLR, [76, 78, 80])
    state.tireRR = driftTire(state.tireRR, [80, 78, 76])

    // Build car telemetry sorted by position
    const playerPct = state.lapDistPcts[PLAYER_CAR_IDX]

    const carsRaw: CarTelemetry[] = state.lapDistPcts.map((pct, i) => {
      // f2Time: how far ahead/behind player in time (negative = ahead)
      let distDelta = playerPct - pct
      // Wrap around track
      if (distDelta > 0.5) distDelta -= 1
      if (distDelta < -0.5) distDelta += 1
      const f2Time = distDelta * LAP_TIME_BASE

      const laps = state.lapTimes[i]
      const lastLap = laps.length > 0 ? laps[laps.length - 1] : 0
      const bestLap = laps.length > 0 ? Math.min(...laps) : 0

      return {
        carIdx: i,
        position: 0,          // assigned below
        lapDistPct: pct,
        lap: state.currentLap[i],
        onTrack: true,
        inPit: false,
        lastLapTime: lastLap,
        bestLapTime: bestLap,
        f2Time,
        startPosition: START_POSITIONS[i].startPos,
      }
    })

    // Assign positions by total distance (lap + pct)
    const sorted = [...carsRaw].sort((a, b) => {
      const totalA = a.lap + a.lapDistPct
      const totalB = b.lap + b.lapDistPct
      return totalB - totalA
    })
    sorted.forEach((car, idx) => {
      carsRaw[car.carIdx].position = idx + 1
    })

    const playerCar = carsRaw[PLAYER_CAR_IDX]
    const playerLaps = state.lapTimes[PLAYER_CAR_IDX]
    const bestLap = playerLaps.length > 0 ? Math.min(...playerLaps) : 0
    const lastLap = playerLaps.length > 0 ? playerLaps[playerLaps.length - 1] : 0

    // Simulate CarLeftRight based on which mock cars are very close
    const closeCars = carsRaw.filter(c => c.carIdx !== PLAYER_CAR_IDX && Math.abs(c.f2Time) < 1.5)
    let carLeftRight = 0
    if (closeCars.length >= 2) carLeftRight = 6        // 2+ on both sides (simplified)
    else if (closeCars.length === 1) carLeftRight = state.tick % 40 < 20 ? 1 : 2  // alternate L/R
    else if (carsRaw.some(c => c.carIdx !== PLAYER_CAR_IDX && Math.abs(c.f2Time) < 3)) {
      carLeftRight = state.tick % 60 < 20 ? 1 : state.tick % 60 < 40 ? 2 : 0
    }

    return {
      connected: true,
      // Dev mode always simulates the driver being in their cockpit so overlays
      // render. Real-SDK IsOnTrack reflects the iRacing menu/cockpit state.
      isOnTrack: true,
      sessionType: state.sessionType,
      sessionTime: state.tick * dt,
      sessionTimeRemain: 1800 - state.tick * dt,

      playerCarIdx: PLAYER_CAR_IDX,
      playerCarRedLine: 9400, // Porsche 992 GT3 Cup
      speed: state.playerSpeed + Math.random() * 2 - 1,
      gear: state.playerGear,
      rpm: state.playerRpm,
      throttle: state.playerThrottle,
      brake: state.playerBrake,
      fuelLevel: state.playerFuelLevel,
      fuelUsePerHour: 75.6,
      lap: state.currentLap[PLAYER_CAR_IDX],
      lapCurrentLapTime: (state.tick * dt) % LAP_TIME_BASE,
      lapLastLapTime: lastLap,
      lapBestLapTime: bestLap,
      lapDeltaToBestLap: bestLap > 0
        ? ((state.tick * dt) % LAP_TIME_BASE) - bestLap * ((state.tick * dt) % LAP_TIME_BASE / LAP_TIME_BASE)
        : NaN,
      lapDistPct: playerCar.lapDistPct,
      tireLF: state.tireLF,
      tireRF: state.tireRF,
      tireLR: state.tireLR,
      tireRR: state.tireRR,
      carLeftRight,
      tc: {
        level:  4,
        active: state.playerThrottle > 0.88,  // TC fires on aggressive throttle
      },
      abs: {
        level:  2,
        active: state.playerBrake > 0.45,     // ABS fires under heavy braking
      },
      cars:     carsRaw,
      drivers:  MOCK_DRIVERS,
      // Dev mode simulates a car with full capability support
      capabilities: { hasSurfaceTireTemps: true, hasTractionControl: true, hasABS: true },
    }
  }

  return { next, setSessionType }
}
