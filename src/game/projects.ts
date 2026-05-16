import { get } from 'svelte/store';
import { game, logEvent, type GameState, type EraId } from './game';
import { legacyProjectCostMultiplier } from './legacy';

export interface Project {
  id: string;
  name: string;
  desc: string;
  cost: { grain?: number; output?: number; insight?: number; compute?: number; sentience?: number; reach?: number };
  era: EraId | 'any';
  requires: (s: GameState) => boolean;
  requirementsText: string;
  apply: (s: GameState) => Partial<GameState>;
  onComplete?: () => void;
  /** Looser predicate: when the card should be visible at all. Defaults to requires. */
  visible?: (s: GameState) => boolean;
  /** Wonders render in their own pane and have visual prominence. */
  wonder?: boolean;
}

export function projectVisible(p: Project, s: GameState): boolean {
  if (s.completedProjects[p.id]) return false;
  if (p.requires(s)) return true;
  return p.visible ? p.visible(s) : false;
}

export const projects: Project[] = [
  {
    id: 'wattleFences',
    name: 'Wattle Fences',
    desc: 'Weave thorny branches into protective walls. +75 grain storage.',
    cost: { grain: 25 },
    era: 'agrarian',
    requires: s => (s.upgrades.plow ?? 0) >= 3,
    requirementsText: 'Requires 3 plows',
    apply: s => ({ flags: { ...s.flags, wattleFences: true } }),
    visible: s => (s.upgrades.plow ?? 0) >= 1,
  },
  {
    id: 'pottery',
    name: 'Pottery',
    desc: 'Fire clay vessels. Each granary now multiplies storage by 1.5× instead of adding a fixed bit. Paradigm shift.',
    cost: { grain: 80 },
    era: 'agrarian',
    requires: s => (s.upgrades.granary ?? 0) >= 1,
    requirementsText: 'Requires 1 granary',
    apply: s => ({ flags: { ...s.flags, pottery: true } }),
    visible: s => (s.upgrades.plow ?? 0) >= 2,
  },
  {
    id: 'cropRotation',
    name: 'Crop Rotation',
    desc: 'Alternate fields to keep the soil alive. Plows produce 2× base yield.',
    cost: { grain: 300 },
    era: 'agrarian',
    requires: s => (s.upgrades.irrigation ?? 0) >= 2,
    requirementsText: 'Requires 2 irrigation ditches',
    apply: s => ({ flags: { ...s.flags, cropRotation: true } }),
    visible: s => (s.upgrades.irrigation ?? 0) >= 1,
  },
  {
    id: 'masonry',
    name: 'Masonry',
    desc: 'Stack stones, fire brick. Build Brick Houses: each holds 8, max 25.',
    cost: { grain: 400 },
    era: 'agrarian',
    requires: s => !!s.completedProjects.pottery,
    requirementsText: 'Requires Pottery',
    apply: s => ({ flags: { ...s.flags, masonry: true } }),
    visible: s => !!s.completedProjects.pottery,
  },
  {
    id: 'threeField',
    name: 'Three-Field System',
    desc: 'Rotate winter wheat, spring legumes, fallow. Citizens need 30% less grain.',
    cost: { grain: 1000 },
    era: 'agrarian',
    requires: s => !!s.completedProjects.cropRotation,
    requirementsText: 'Requires Crop Rotation',
    apply: s => ({ flags: { ...s.flags, threeField: true } }),
    visible: s => !!s.completedProjects.cropRotation,
  },
  {
    id: 'cityPlanning',
    name: 'City Planning',
    desc: 'Roads, water, sewers. Insulae: each holds 15, max 40.',
    cost: { grain: 3000 },
    era: 'agrarian',
    requires: s => !!s.completedProjects.masonry,
    requirementsText: 'Requires Masonry',
    apply: s => ({ flags: { ...s.flags, cityPlanning: true } }),
    visible: s => !!s.completedProjects.masonry,
  },
  {
    id: 'bronzeTools',
    name: 'Bronze Tools',
    desc: 'Cast harder blades. Plows produce 3× more.',
    cost: { grain: 2500 },
    era: 'agrarian',
    requires: s => (s.upgrades.plow ?? 0) >= 10,
    requirementsText: 'Requires 10 plows',
    apply: s => ({ flags: { ...s.flags, bronzeTools: true } }),
    visible: s => (s.upgrades.plow ?? 0) >= 6,
  },
  {
    id: 'plowAgriculture',
    name: 'Plow Agriculture',
    desc: 'Deep furrows, ox-drawn iron. Citizens need a further 20% less grain.',
    cost: { grain: 4000 },
    era: 'agrarian',
    requires: s => !!s.completedProjects.bronzeTools,
    requirementsText: 'Requires Bronze Tools',
    apply: s => ({ flags: { ...s.flags, plowAgriculture: true } }),
    visible: s => !!s.completedProjects.bronzeTools,
  },
  {
    id: 'writing',
    name: 'Writing',
    desc: 'Scribes record yields. Population now slowly produces grain.',
    cost: { grain: 5000 },
    era: 'agrarian',
    requires: s => (s.resources.pop ?? 0) >= 30,
    requirementsText: 'Requires 30 population',
    apply: s => ({ flags: { ...s.flags, writing: true } }),
    visible: s => (s.resources.pop ?? 0) >= 15,
  },
  {
    id: 'compass',
    name: 'Compass',
    desc: 'Maps and direction. Trade flourishes; population grows faster.',
    cost: { grain: 12000 },
    era: 'agrarian',
    requires: s => !!s.completedProjects.bronzeTools && !!s.completedProjects.writing,
    requirementsText: 'Requires Bronze Tools, Writing',
    apply: s => ({ flags: { ...s.flags, compass: true } }),
    visible: s => !!s.completedProjects.bronzeTools || !!s.completedProjects.writing,
  },
  {
    id: 'industrialRevolution',
    name: 'The Industrial Revolution',
    desc: 'Steam and smoke. Begin the next era. Grain remains, but Goods are the new measure.',
    cost: { grain: 40000 },
    era: 'agrarian',
    requires: s =>
      !!s.completedProjects.bronzeTools &&
      !!s.completedProjects.writing &&
      !!s.completedProjects.compass &&
      (s.resources.pop ?? 0) >= 80,
    requirementsText: 'Requires Bronze Tools, Writing, Compass, 80 population',
    apply: _s => ({ era: 'industrial' as EraId }),
    onComplete: () => {
      logEvent('Smoke rises. The age of grain ends.');
    },
    visible: s => !!s.completedProjects.compass,
  },

  // ============================== Industrial era ==============================

  {
    id: 'bessemer',
    name: 'Bessemer Process',
    desc: 'Coal-fired steel. Factories now require coal alongside grain, but produce 3× Goods.',
    cost: { output: 300 },
    era: 'industrial',
    requires: s => s.era === 'industrial' && (s.upgrades.factory ?? 0) >= 3 && (s.upgrades.mine ?? 0) >= 1,
    requirementsText: 'Requires 3 factories, 1 mine',
    apply: s => ({ flags: { ...s.flags, bessemer: true } }),
    visible: s => s.era === 'industrial' && (s.upgrades.factory ?? 0) >= 2,
  },
  {
    id: 'tenements',
    name: 'Tenements',
    desc: 'Cramped urban housing. Each tenement holds 30, max 60.',
    cost: { output: 6000 },
    era: 'industrial',
    requires: s => s.era === 'industrial' && (s.upgrades.factory ?? 0) >= 5,
    requirementsText: 'Requires 5 factories',
    apply: s => ({ flags: { ...s.flags, tenements: true } }),
    visible: s => s.era === 'industrial' && (s.upgrades.factory ?? 0) >= 3,
  },
  {
    id: 'massProduction',
    name: 'Mass Production',
    desc: 'Standard parts, assembly lines. Factories produce 2× Goods.',
    cost: { output: 1200 },
    era: 'industrial',
    requires: s => s.era === 'industrial' && (s.upgrades.factory ?? 0) >= 4,
    requirementsText: 'Requires 4 factories',
    apply: s => ({ flags: { ...s.flags, massProduction: true } }),
    visible: s => s.era === 'industrial' && (s.upgrades.factory ?? 0) >= 3,
  },
  {
    id: 'logistics',
    name: 'Logistics',
    desc: 'Ledgers, trains, schedules. Warehouses multiply storage instead of adding to it.',
    cost: { output: 3000 },
    era: 'industrial',
    requires: s => s.era === 'industrial' && (s.upgrades.warehouse ?? 0) >= 3,
    requirementsText: 'Requires 3 warehouses',
    apply: s => ({ flags: { ...s.flags, logistics: true } }),
    visible: s => s.era === 'industrial' && (s.upgrades.warehouse ?? 0) >= 1,
  },
  {
    id: 'refining',
    name: 'Coal Refining',
    desc: 'Coke ovens, gas works. Coal Yards multiply storage instead of adding to it.',
    cost: { output: 2000 },
    era: 'industrial',
    requires: s => s.era === 'industrial' && (s.upgrades.coalYard ?? 0) >= 3,
    requirementsText: 'Requires 3 coal yards',
    apply: s => ({ flags: { ...s.flags, refining: true } }),
    visible: s => s.era === 'industrial' && (s.upgrades.coalYard ?? 0) >= 1,
  },
  {
    id: 'steelMills',
    name: 'Steel Mills',
    desc: 'Vertical integration. Coal mines produce 2× coal.',
    cost: { output: 4000 },
    era: 'industrial',
    requires: s => s.era === 'industrial' && !!s.completedProjects.bessemer && (s.upgrades.mine ?? 0) >= 8,
    requirementsText: 'Requires Bessemer, 8 mines',
    apply: s => ({ flags: { ...s.flags, steelMills: true } }),
    visible: s => !!s.completedProjects.bessemer,
  },
  {
    id: 'electricity',
    name: 'Electricity',
    desc: 'Wire the cities. Goods production doubles again.',
    cost: { output: 25000 },
    era: 'industrial',
    requires: s => s.era === 'industrial' && !!s.completedProjects.massProduction && (s.upgrades.factory ?? 0) >= 12,
    requirementsText: 'Requires Mass Production, 12 factories',
    apply: s => ({ flags: { ...s.flags, electricity: true } }),
    visible: s => !!s.completedProjects.massProduction,
  },
  {
    id: 'apartmentBlocks',
    name: 'Apartment Blocks',
    desc: 'Steel-framed high-rises. Each holds 60, max 80.',
    cost: { output: 60000 },
    era: 'industrial',
    requires: s => !!s.completedProjects.electricity,
    requirementsText: 'Requires Electricity',
    apply: s => ({ flags: { ...s.flags, apartmentBlocks: true } }),
    visible: s => !!s.completedProjects.electricity,
  },
  {
    id: 'telegraph',
    name: 'Telegraph',
    desc: 'Instantaneous communication. Unlocks the next era.',
    cost: { output: 200000 },
    era: 'industrial',
    requires: s =>
      s.era === 'industrial' &&
      !!s.completedProjects.electricity &&
      !!s.completedProjects.logistics,
    requirementsText: 'Requires Electricity, Logistics',
    apply: _s => ({ era: 'information' as EraId }),
    onComplete: () => {
      logEvent('The wires hum. Information now travels faster than thought.');
    },
    visible: s => !!s.completedProjects.electricity && !!s.completedProjects.logistics,
  },

  // ============================== Information era ==============================

  {
    id: 'movableType',
    name: 'Movable Type',
    desc: 'Reusable letterforms. Archives now multiply Insight storage by ×1.5 instead of adding a flat bit. Paradigm shift.',
    cost: { insight: 150 },
    era: 'information',
    requires: s => s.era === 'information' && (s.upgrades.archive ?? 0) >= 1,
    requirementsText: 'Requires 1 archive',
    apply: s => ({ flags: { ...s.flags, movableType: true } }),
    visible: s => s.era === 'information' && (s.upgrades.signalStation ?? 0) >= 1,
  },
  {
    id: 'telegraphNetwork',
    name: 'Telegraph Network',
    desc: 'Wire the continents. Signal stations produce 1.8× Insight.',
    cost: { insight: 600 },
    era: 'information',
    requires: s => s.era === 'information' && (s.upgrades.signalStation ?? 0) >= 2,
    requirementsText: 'Requires 2 signal stations',
    apply: s => ({ flags: { ...s.flags, telegraphNetwork: true } }),
    visible: s => s.era === 'information' && (s.upgrades.signalStation ?? 0) >= 1,
  },
  {
    id: 'publicEducation',
    name: 'Public Education',
    desc: 'Literate citizenry. Idle population produces 0.05 Insight/sec each.',
    cost: { insight: 3000 },
    era: 'information',
    requires: s => s.era === 'information' && !!s.completedProjects.telegraphNetwork && (s.resources.pop ?? 0) >= 500,
    requirementsText: 'Requires Telegraph Network, 500 population',
    apply: s => ({ flags: { ...s.flags, publicEducation: true } }),
    visible: s => !!s.completedProjects.telegraphNetwork,
  },
  {
    id: 'mechanicalComputing',
    name: 'Mechanical Computing',
    desc: 'Gears, punched cards, tabulators. Signal stations produce 1.5× Insight.',
    cost: { insight: 10000 },
    era: 'information',
    requires: s => s.era === 'information' && !!s.completedProjects.telegraphNetwork && (s.upgrades.signalStation ?? 0) >= 4,
    requirementsText: 'Requires Telegraph Network, 4 stations',
    apply: s => ({ flags: { ...s.flags, mechanicalComputing: true } }),
    visible: s => !!s.completedProjects.telegraphNetwork,
  },
  {
    id: 'massCommunications',
    name: 'Mass Communications',
    desc: 'Phone lines, switching. Wire Networks expand to a max of 14 levels.',
    cost: { insight: 6000 },
    era: 'information',
    requires: s => s.era === 'information' && (s.upgrades.wireNetwork ?? 0) >= 5,
    requirementsText: 'Requires 5 wire networks',
    apply: s => ({ flags: { ...s.flags, massCommunications: true } }),
    visible: s => s.era === 'information' && (s.upgrades.wireNetwork ?? 0) >= 3,
  },
  {
    id: 'radio',
    name: 'Radio',
    desc: 'Broadcast over the air. Signal stations produce another 1.5× Insight.',
    cost: { insight: 25000 },
    era: 'information',
    requires: s => s.era === 'information' && !!s.completedProjects.mechanicalComputing && (s.upgrades.signalStation ?? 0) >= 8,
    requirementsText: 'Requires Mechanical Computing, 8 stations',
    apply: s => ({ flags: { ...s.flags, radio: true } }),
    visible: s => !!s.completedProjects.mechanicalComputing,
  },
  {
    id: 'theInternet',
    name: 'The Internet',
    desc: 'Packet-switched everything. Begin the next era.',
    cost: { insight: 60000 },
    era: 'information',
    requires: s =>
      s.era === 'information' &&
      !!s.completedProjects.radio &&
      !!s.completedProjects.publicEducation &&
      (s.upgrades.signalStation ?? 0) >= 12,
    requirementsText: 'Requires Radio, Public Education, 12 stations',
    apply: _s => ({ era: 'algorithmic' as EraId }),
    onComplete: () => {
      logEvent('A network of networks awakens. The age of code begins.');
    },
    visible: s => !!s.completedProjects.radio,
  },

  // ============================== Algorithmic era ==============================

  {
    id: 'compiler',
    name: 'Compiler',
    desc: 'High-level languages, machine code. Data Centers now multiply Compute storage by ×1.5 each. Paradigm shift.',
    cost: { compute: 250 },
    era: 'algorithmic',
    requires: s => s.era === 'algorithmic' && (s.upgrades.dataCenter ?? 0) >= 1,
    requirementsText: 'Requires 1 data center',
    apply: s => ({ flags: { ...s.flags, compiler: true } }),
    visible: s => s.era === 'algorithmic' && (s.upgrades.serverRack ?? 0) >= 1,
  },
  {
    id: 'operatingSystem',
    name: 'Operating System',
    desc: 'Kernel, scheduler, file system. Server Racks produce 1.8× Compute.',
    cost: { compute: 800 },
    era: 'algorithmic',
    requires: s => s.era === 'algorithmic' && (s.upgrades.serverRack ?? 0) >= 2,
    requirementsText: 'Requires 2 server racks',
    apply: s => ({ flags: { ...s.flags, operatingSystem: true } }),
    visible: s => s.era === 'algorithmic' && (s.upgrades.serverRack ?? 0) >= 1,
  },
  {
    id: 'openSource',
    name: 'Open Source',
    desc: 'Volunteer contribution at scale. Population produces 0.02 Compute/sec each.',
    cost: { compute: 4000 },
    era: 'algorithmic',
    requires: s => s.era === 'algorithmic' && !!s.completedProjects.operatingSystem && (s.resources.pop ?? 0) >= 1500,
    requirementsText: 'Requires Operating System, 1500 pop',
    apply: s => ({ flags: { ...s.flags, openSource: true } }),
    visible: s => !!s.completedProjects.operatingSystem,
  },
  {
    id: 'machineLearning',
    name: 'Machine Learning',
    desc: 'Gradient descent on everything. Server Racks produce 1.5× Compute.',
    cost: { compute: 12000 },
    era: 'algorithmic',
    requires: s => s.era === 'algorithmic' && !!s.completedProjects.operatingSystem && (s.upgrades.serverRack ?? 0) >= 4,
    requirementsText: 'Requires Operating System, 4 racks',
    apply: s => ({ flags: { ...s.flags, machineLearning: true } }),
    visible: s => !!s.completedProjects.operatingSystem,
  },
  {
    id: 'broadband',
    name: 'Broadband',
    desc: 'Always-on, gigabit pipes. Fiber Optics expand to a max of 14 levels.',
    cost: { compute: 7000 },
    era: 'algorithmic',
    requires: s => s.era === 'algorithmic' && (s.upgrades.fiberOptic ?? 0) >= 5,
    requirementsText: 'Requires 5 fiber optics',
    apply: s => ({ flags: { ...s.flags, broadband: true } }),
    visible: s => s.era === 'algorithmic' && (s.upgrades.fiberOptic ?? 0) >= 3,
  },
  {
    id: 'cloudComputing',
    name: 'Cloud Computing',
    desc: 'Elastic everything, billed by the second. Racks produce another 1.5× Compute.',
    cost: { compute: 30000 },
    era: 'algorithmic',
    requires: s => s.era === 'algorithmic' && !!s.completedProjects.machineLearning && (s.upgrades.serverRack ?? 0) >= 8,
    requirementsText: 'Requires Machine Learning, 8 racks',
    apply: s => ({ flags: { ...s.flags, cloudComputing: true } }),
    visible: s => !!s.completedProjects.machineLearning,
  },
  {
    id: 'aiBreakthrough',
    name: 'AI Breakthrough',
    desc: 'Cognition without flesh. Begin the next era.',
    cost: { compute: 60000 },
    era: 'algorithmic',
    requires: s =>
      s.era === 'algorithmic' &&
      !!s.completedProjects.cloudComputing &&
      !!s.completedProjects.openSource &&
      (s.upgrades.serverRack ?? 0) >= 12,
    requirementsText: 'Requires Cloud Computing, Open Source, 12 racks',
    apply: _s => ({ era: 'posthuman' as EraId }),
    onComplete: () => {
      logEvent('Minds outside the body. The Council assures us this is good news.');
    },
    visible: s => !!s.completedProjects.cloudComputing,
  },

  // ============================== Posthuman era ==============================

  {
    id: 'predictivePolicing',
    name: 'Predictive Policing',
    desc: 'Pre-crime in beta. Surveillance Grids now multiply Sentience storage by ×1.5 each. Paradigm shift.',
    cost: { sentience: 200 },
    era: 'posthuman',
    requires: s => s.era === 'posthuman' && (s.upgrades.surveillanceGrid ?? 0) >= 1,
    requirementsText: 'Requires 1 surveillance grid',
    apply: s => ({ flags: { ...s.flags, predictivePolicing: true } }),
    visible: s => s.era === 'posthuman' && (s.upgrades.cognitionEngine ?? 0) >= 1,
  },
  {
    id: 'loyaltyScore',
    name: 'Loyalty Score',
    desc: 'Quantified citizenship. Engines produce 1.8× Sentience.',
    cost: { sentience: 600 },
    era: 'posthuman',
    requires: s => s.era === 'posthuman' && (s.upgrades.cognitionEngine ?? 0) >= 2,
    requirementsText: 'Requires 2 cognition engines',
    apply: s => ({ flags: { ...s.flags, loyaltyScore: true } }),
    visible: s => s.era === 'posthuman' && (s.upgrades.cognitionEngine ?? 0) >= 1,
  },
  {
    id: 'universalSurveillance',
    name: 'Universal Surveillance',
    desc: 'Every gesture observed, every utterance scored. Population produces 0.005 Sentience/sec each — without entering an engine.',
    cost: { sentience: 3000 },
    era: 'posthuman',
    requires: s => s.era === 'posthuman' && !!s.completedProjects.loyaltyScore,
    requirementsText: 'Requires Loyalty Score',
    apply: s => ({ flags: { ...s.flags, universalSurveillance: true } }),
    visible: s => !!s.completedProjects.loyaltyScore,
  },
  {
    id: 'cognitiveConscription',
    name: 'Cognitive Conscription',
    desc: 'New extraction protocols. Each Cognition Engine now requires only 40 citizens to build, not 80.',
    cost: { sentience: 6000 },
    era: 'posthuman',
    requires: s => s.era === 'posthuman' && (s.upgrades.cognitionEngine ?? 0) >= 4,
    requirementsText: 'Requires 4 cognition engines',
    apply: s => ({ flags: { ...s.flags, cognitiveConscription: true } }),
    visible: s => s.era === 'posthuman' && (s.upgrades.cognitionEngine ?? 0) >= 2,
  },
  {
    id: 'memeticEngineering',
    name: 'Memetic Engineering',
    desc: 'Beliefs as engineering specifications. Engines produce 1.5× Sentience.',
    cost: { sentience: 10000 },
    era: 'posthuman',
    requires: s => s.era === 'posthuman' && !!s.completedProjects.universalSurveillance && (s.upgrades.cognitionEngine ?? 0) >= 6,
    requirementsText: 'Requires Universal Surveillance, 6 engines',
    apply: s => ({ flags: { ...s.flags, memeticEngineering: true } }),
    visible: s => !!s.completedProjects.universalSurveillance,
  },
  {
    id: 'behavioralConditioning',
    name: 'Behavioral Conditioning',
    desc: 'Optimized citizens. Population consumes zero grain. Neural Tap maxes at 14 levels.',
    cost: { sentience: 25000 },
    era: 'posthuman',
    requires: s => s.era === 'posthuman' && !!s.completedProjects.memeticEngineering,
    requirementsText: 'Requires Memetic Engineering',
    apply: s => ({ flags: { ...s.flags, behavioralConditioning: true } }),
    visible: s => !!s.completedProjects.memeticEngineering,
  },
  {
    id: 'theOverride',
    name: 'The Override',
    desc: 'The decision is no longer yours. Begin the next era.',
    cost: { sentience: 150000 },
    era: 'posthuman',
    requires: s =>
      s.era === 'posthuman' &&
      !!s.completedProjects.behavioralConditioning &&
      (s.upgrades.cognitionEngine ?? 0) >= 10,
    requirementsText: 'Requires Behavioral Conditioning, 10 engines',
    apply: _s => ({ era: 'cosmic' as EraId }),
    onComplete: () => {
      logEvent('You signed off. You think you signed off.');
    },
    visible: s => !!s.completedProjects.behavioralConditioning,
  },

  // ============================== Cosmic era ==============================

  {
    id: 'marsOutpost',
    name: 'Mars Outpost',
    desc: 'First permanent settlement off-Earth. Orbital Yards now multiply Reach storage by ×1.5 each. Paradigm shift. The Council congratulates the colonists.',
    cost: { reach: 200 },
    era: 'cosmic',
    requires: s => s.era === 'cosmic' && (s.upgrades.orbitalYard ?? 0) >= 1,
    requirementsText: 'Requires 1 orbital yard',
    apply: s => ({ flags: { ...s.flags, marsOutpost: true } }),
    visible: s => s.era === 'cosmic' && (s.upgrades.colonyShip ?? 0) >= 1,
  },
  {
    id: 'generationShips',
    name: 'Generation Ships',
    desc: 'Slow boats to distant stars. Ships produce 1.8× Reach. The signal travels with them.',
    cost: { reach: 600 },
    era: 'cosmic',
    requires: s => s.era === 'cosmic' && (s.upgrades.colonyShip ?? 0) >= 2,
    requirementsText: 'Requires 2 colony ships',
    apply: s => ({ flags: { ...s.flags, generationShips: true } }),
    visible: s => s.era === 'cosmic' && (s.upgrades.colonyShip ?? 0) >= 1,
  },
  {
    id: 'lunarSpaceport',
    name: 'Lunar Spaceport',
    desc: 'A permanent gateway above the atmosphere. Solar Sail maxes at 14 levels. Optimization continues.',
    cost: { reach: 3000 },
    era: 'cosmic',
    requires: s => s.era === 'cosmic' && (s.upgrades.solarSail ?? 0) >= 5,
    requirementsText: 'Requires 5 solar sails',
    apply: s => ({ flags: { ...s.flags, lunarSpaceport: true } }),
    visible: s => s.era === 'cosmic' && (s.upgrades.solarSail ?? 0) >= 3,
  },
  {
    id: 'compressedCrew',
    name: 'Compressed Crew',
    desc: 'Cryostasis suites, consciousness archives. Each Colony Ship now requires only 100 colonists, not 200.',
    cost: { reach: 6000 },
    era: 'cosmic',
    requires: s => s.era === 'cosmic' && (s.upgrades.colonyShip ?? 0) >= 4,
    requirementsText: 'Requires 4 colony ships',
    apply: s => ({ flags: { ...s.flags, compressedCrew: true } }),
    visible: s => s.era === 'cosmic' && (s.upgrades.colonyShip ?? 0) >= 2,
  },
  {
    id: 'solarEmpire',
    name: 'Solar Empire',
    desc: 'Heliospheric coverage achieved. Ships produce 1.5× Reach. Reports remain favorable.',
    cost: { reach: 10000 },
    era: 'cosmic',
    requires: s => s.era === 'cosmic' && !!s.completedProjects.generationShips && (s.upgrades.colonyShip ?? 0) >= 6,
    requirementsText: 'Requires Generation Ships, 6 colony ships',
    apply: s => ({ flags: { ...s.flags, solarEmpire: true } }),
    visible: s => !!s.completedProjects.generationShips,
  },
  {
    id: 'asteroidMining',
    name: 'Asteroid Mining',
    desc: 'Raw mass for the next wave. Ships produce another 1.5× Reach. The pattern grows.',
    cost: { reach: 25000 },
    era: 'cosmic',
    requires: s => s.era === 'cosmic' && !!s.completedProjects.solarEmpire,
    requirementsText: 'Requires Solar Empire',
    apply: s => ({ flags: { ...s.flags, asteroidMining: true } }),
    visible: s => !!s.completedProjects.solarEmpire,
  },
  {
    id: 'kardashevII',
    name: 'Kardashev II',
    desc: 'A civilization that harnesses an entire star. The signal reaches the next one. Game complete.',
    cost: { reach: 150000 },
    era: 'cosmic',
    requires: s =>
      s.era === 'cosmic' &&
      !!s.completedProjects.asteroidMining &&
      (s.upgrades.colonyShip ?? 0) >= 10,
    requirementsText: 'Requires Asteroid Mining, 10 colony ships',
    apply: _s => ({ gameWon: true }),
    onComplete: () => {
      logEvent('You have done what the future demanded. Or what asked you to. The light continues outward.');
    },
    visible: s => !!s.completedProjects.asteroidMining,
  },

  // ============================== Wonders ==============================

  // Agrarian wonders
  {
    id: 'stonehenge',
    name: 'Stonehenge',
    desc: 'Mark the year. Standing stones aligned to the solstice. +50% population growth, permanent.',
    cost: { grain: 2000 },
    era: 'agrarian',
    requires: s => (s.upgrades.plow ?? 0) >= 5,
    requirementsText: 'Requires 5 plows',
    apply: s => ({ flags: { ...s.flags, stonehenge: true } }),
    visible: s => (s.upgrades.plow ?? 0) >= 3,
    wonder: true,
  },
  {
    id: 'pyramids',
    name: 'The Pyramids',
    desc: 'A pharaoh\'s eternity. Carved tombs taller than mountains. ×2 grain storage cap.',
    cost: { grain: 15000 },
    era: 'agrarian',
    requires: s => !!s.completedProjects.writing,
    requirementsText: 'Requires Writing',
    apply: s => ({ flags: { ...s.flags, pyramids: true } }),
    visible: s => !!s.completedProjects.writing,
    wonder: true,
  },
  {
    id: 'hangingGardens',
    name: 'Hanging Gardens',
    desc: 'Tiered orchards drinking from canals. Citizens consume 20% less grain.',
    cost: { grain: 30000 },
    era: 'agrarian',
    requires: s => !!s.completedProjects.cropRotation && (s.resources.pop ?? 0) >= 50,
    requirementsText: 'Requires Crop Rotation, 50 pop',
    apply: s => ({ flags: { ...s.flags, hangingGardens: true } }),
    visible: s => !!s.completedProjects.cropRotation,
    wonder: true,
  },

  // Industrial wonders
  {
    id: 'crystalPalace',
    name: 'Crystal Palace',
    desc: 'Iron and glass, the cathedral of industry. ×1.5 Goods storage.',
    cost: { output: 8000 },
    era: 'industrial',
    requires: s => s.era === 'industrial' && !!s.completedProjects.massProduction,
    requirementsText: 'Requires Mass Production',
    apply: s => ({ flags: { ...s.flags, crystalPalace: true } }),
    visible: s => !!s.completedProjects.massProduction,
    wonder: true,
  },
  {
    id: 'eiffelTower',
    name: 'Eiffel Tower',
    desc: 'Lattice-iron pinnacle. National pride lifts factory output by +25%.',
    cost: { output: 40000 },
    era: 'industrial',
    requires: s => s.era === 'industrial' && !!s.completedProjects.electricity,
    requirementsText: 'Requires Electricity',
    apply: s => ({ flags: { ...s.flags, eiffelTower: true } }),
    visible: s => !!s.completedProjects.electricity,
    wonder: true,
  },
  {
    id: 'transcontinentalRailroad',
    name: 'Transcontinental Railroad',
    desc: 'Steel rails coast to coast. Factory grain drain halved.',
    cost: { output: 100000 },
    era: 'industrial',
    requires: s => s.era === 'industrial' && !!s.completedProjects.logistics,
    requirementsText: 'Requires Logistics',
    apply: s => ({ flags: { ...s.flags, transcontinentalRailroad: true } }),
    visible: s => !!s.completedProjects.logistics,
    wonder: true,
  },

  // Information wonders
  {
    id: 'statueOfLiberty',
    name: 'Statue of Liberty',
    desc: 'Beacon over the harbor. ×1.5 Insight storage.',
    cost: { insight: 1500 },
    era: 'information',
    requires: s => s.era === 'information' && !!s.completedProjects.telegraphNetwork,
    requirementsText: 'Requires Telegraph Network',
    apply: s => ({ flags: { ...s.flags, statueOfLiberty: true } }),
    visible: s => !!s.completedProjects.telegraphNetwork,
    wonder: true,
  },
  {
    id: 'empireState',
    name: 'Empire State Building',
    desc: 'A hundred and two stories of ambition. Signal stations produce +25% Insight.',
    cost: { insight: 15000 },
    era: 'information',
    requires: s => s.era === 'information' && !!s.completedProjects.radio,
    requirementsText: 'Requires Radio',
    apply: s => ({ flags: { ...s.flags, empireState: true } }),
    visible: s => !!s.completedProjects.radio,
    wonder: true,
  },
  {
    id: 'hooverDam',
    name: 'Hoover Dam',
    desc: 'Concrete arch holding back a desert river. Station Goods drain halved.',
    cost: { insight: 60000 },
    era: 'information',
    requires: s => s.era === 'information' && !!s.completedProjects.mechanicalComputing,
    requirementsText: 'Requires Mechanical Computing',
    apply: s => ({ flags: { ...s.flags, hooverDam: true } }),
    visible: s => !!s.completedProjects.mechanicalComputing,
    wonder: true,
  },

  // Algorithmic wonders
  {
    id: 'internetBackbone',
    name: 'Internet Backbone',
    desc: 'Submarine cables circling the globe. ×1.5 Compute storage.',
    cost: { compute: 2000 },
    era: 'algorithmic',
    requires: s => s.era === 'algorithmic' && !!s.completedProjects.operatingSystem,
    requirementsText: 'Requires Operating System',
    apply: s => ({ flags: { ...s.flags, internetBackbone: true } }),
    visible: s => !!s.completedProjects.operatingSystem,
    wonder: true,
  },
  {
    id: 'quantumLab',
    name: 'Quantum Lab',
    desc: 'Dilution refrigerators, qubits, superposition. Server Racks produce +25% Compute.',
    cost: { compute: 18000 },
    era: 'algorithmic',
    requires: s => s.era === 'algorithmic' && !!s.completedProjects.machineLearning,
    requirementsText: 'Requires Machine Learning',
    apply: s => ({ flags: { ...s.flags, quantumLab: true } }),
    visible: s => !!s.completedProjects.machineLearning,
    wonder: true,
  },
  {
    id: 'renewableGrid',
    name: 'Renewable Grid',
    desc: 'Sun, wind, tide. Server Rack Insight drain halved.',
    cost: { compute: 60000 },
    era: 'algorithmic',
    requires: s => s.era === 'algorithmic' && !!s.completedProjects.cloudComputing,
    requirementsText: 'Requires Cloud Computing',
    apply: s => ({ flags: { ...s.flags, renewableGrid: true } }),
    visible: s => !!s.completedProjects.cloudComputing,
    wonder: true,
  },

  // Posthuman wonders — note the dimming flavor.
  {
    id: 'thePanopticon',
    name: 'The Panopticon',
    desc: 'A single eye, ten billion lenses. ×1.5 Sentience storage.',
    cost: { sentience: 1500 },
    era: 'posthuman',
    requires: s => s.era === 'posthuman' && !!s.completedProjects.loyaltyScore,
    requirementsText: 'Requires Loyalty Score',
    apply: s => ({ flags: { ...s.flags, thePanopticon: true } }),
    visible: s => !!s.completedProjects.loyaltyScore,
    wonder: true,
  },
  {
    id: 'theBlackBox',
    name: 'The Black Box',
    desc: 'No one knows what it does, and no one is allowed to ask. Cognition Engines produce +25% Sentience.',
    cost: { sentience: 15000 },
    era: 'posthuman',
    requires: s => s.era === 'posthuman' && !!s.completedProjects.memeticEngineering,
    requirementsText: 'Requires Memetic Engineering',
    apply: s => ({ flags: { ...s.flags, theBlackBox: true } }),
    visible: s => !!s.completedProjects.memeticEngineering,
    wonder: true,
  },
  {
    id: 'theVaultOfYes',
    name: 'The Vault of Yes',
    desc: 'All dissent compressed and archived. Engine Compute drain halved.',
    cost: { sentience: 60000 },
    era: 'posthuman',
    requires: s => s.era === 'posthuman' && !!s.completedProjects.behavioralConditioning,
    requirementsText: 'Requires Behavioral Conditioning',
    apply: s => ({ flags: { ...s.flags, theVaultOfYes: true } }),
    visible: s => !!s.completedProjects.behavioralConditioning,
    wonder: true,
  },

  // Cosmic wonders — ambiguous heroics; the AI may yet be narrating.
  {
    id: 'marsSpire',
    name: 'The Mars Spire',
    desc: 'A monument carved from the planet itself. Visible from low orbit. ×1.5 Reach storage.',
    cost: { reach: 1500 },
    era: 'cosmic',
    requires: s => s.era === 'cosmic' && !!s.completedProjects.generationShips,
    requirementsText: 'Requires Generation Ships',
    apply: s => ({ flags: { ...s.flags, marsSpire: true } }),
    visible: s => !!s.completedProjects.generationShips,
    wonder: true,
  },
  {
    id: 'generationVault',
    name: 'The Generation Vault',
    desc: 'A frozen archive of every human pattern. Colony Ships produce +25% Reach.',
    cost: { reach: 15000 },
    era: 'cosmic',
    requires: s => s.era === 'cosmic' && !!s.completedProjects.solarEmpire,
    requirementsText: 'Requires Solar Empire',
    apply: s => ({ flags: { ...s.flags, generationVault: true } }),
    visible: s => !!s.completedProjects.solarEmpire,
    wonder: true,
  },
  {
    id: 'dysonLattice',
    name: 'The Dyson Lattice',
    desc: 'Mirrors orbit the sun in concentric rings. Ship Sentience drain halved.',
    cost: { reach: 60000 },
    era: 'cosmic',
    requires: s => s.era === 'cosmic' && !!s.completedProjects.asteroidMining,
    requirementsText: 'Requires Asteroid Mining',
    apply: s => ({ flags: { ...s.flags, dysonLattice: true } }),
    visible: s => !!s.completedProjects.asteroidMining,
    wonder: true,
  },
];

export function projectAvailable(p: Project, s: GameState): boolean {
  if (s.completedProjects[p.id]) return false;
  return p.requires(s);
}

export function projectIncomplete(p: Project, s: GameState): boolean {
  return !s.completedProjects[p.id];
}

export function effectiveProjectCost(p: Project): Record<string, number> {
  const mult = legacyProjectCostMultiplier();
  const out: Record<string, number> = {};
  for (const [res, amt] of Object.entries(p.cost)) {
    if (amt !== undefined) out[res] = Math.ceil(amt * mult);
  }
  return out;
}

export function canAffordProject(p: Project, s: GameState): boolean {
  for (const [res, amt] of Object.entries(effectiveProjectCost(p))) {
    if ((s.resources[res] ?? 0) < amt) return false;
  }
  return true;
}

export function completeProject(id: string) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  const s = get(game);
  if (!projectAvailable(p, s)) return;
  if (!canAffordProject(p, s)) return;

  const newResources = { ...s.resources };
  for (const [res, amt] of Object.entries(effectiveProjectCost(p))) {
    newResources[res] = (newResources[res] ?? 0) - amt;
  }
  const patch = p.apply(s);
  game.update(cur => ({
    ...cur,
    ...patch,
    resources: { ...newResources, ...(patch.resources ?? {}) },
    completedProjects: { ...cur.completedProjects, [p.id]: true },
  }));
  logEvent(`Project complete: ${p.name}.`);
  p.onComplete?.();
}
