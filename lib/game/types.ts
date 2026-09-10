export type FactionId = 'synod' | 'compact' | 'host' | 'choir';
export type RoleId =
  | 'hq'
  | 'industrial'
  | 'warehouse'
  | 'spy'
  | 'training'
  | 'fortress'
  | 'depot';
export type ActionType =
  | 'attack'
  | 'march'
  | 'fortify'
  | 'repair'
  | 'recon'
  | 'sabotage'
  | 'develop'
  | 'produce'
  | 'research'
  | 'faction';
export type Phase =
  | 'setup'
  | 'production'
  | 'programming'
  | 'resolution'
  | 'ended';
export interface Faction {
  id: FactionId;
  name: string;
  color: string;
  glyph: string;
  startTerritories: number;
  production: number;
  defenseBonus: number;
  trainingBonus: number;
  special: string;
  vp: number;
  eliminated: boolean;
  technologies: string[];
}
export interface Territory {
  id: number;
  name: string;
  region: number;
  x: number;
  y: number;
  adjacent: number[];
  defense: 1 | 2;
  resourceValue: 1 | 2 | 3;
  storedResources: number;
  owner: FactionId | null;
  troops: number;
  role: RoleId | null;
  roleRevealed: boolean;
  damage: number;
  fortified: number;
}
export interface HiddenRole {
  id: RoleId;
  name: string;
  defenseBonus: number;
  description: string;
}
export interface CardDefinition {
  id: string;
  faction: FactionId;
  name: string;
  action: ActionType;
  speed: number;
  band: 'green' | 'yellow' | 'red';
  power: number;
  productionMode?: 'fast' | 'total';
  sequence: string;
  reaction: string;
}
export interface ProgrammedAction {
  faction: FactionId;
  cardId: string;
  speed: number;
  slot: number;
  targetId?: number;
  originIds?: number[];
  attackOrders?: AttackOrder[];
}
export interface TroopCommitment {
  territoryId: number;
  troops: number;
}
export interface AttackOrder {
  targetId: number;
  commitments: TroopCommitment[];
}
export interface AttackDraft {
  orderIndex: 0 | 1;
  targetId: number | null;
  commitments: TroopCommitment[];
}
export interface Reaction {
  faction: FactionId;
  cardId: string;
  trigger: 'attacked' | 'loses-territory' | 'always';
  used: boolean;
}
export interface CombatResult {
  attacker: FactionId;
  defender: FactionId | null;
  targetId: number;
  originIds: number[];
  attackDice: number[];
  defenseDice: number[];
  attackerLosses: number;
  defenderLosses: number;
  damageAdded: number;
  captured: boolean;
  targetHadDamage: boolean;
  summary: string;
}
export type RoundGoalKind =
  | 'control-territory'
  | 'survive-attack'
  | 'troop-network'
  | 'low-resource-holdings'
  | 'compact-domain'
  | 'stored-resources';
export interface RoundGoal {
  id: string;
  name: string;
  description: string;
  reward: {
    kind: 'vp' | 'dice' | 'troops' | 'technology';
    amount: number;
  };
  kind: RoundGoalKind;
  targetTerritoryId?: number;
  threshold?: number;
  claimedBy: FactionId[];
}
export interface Technology {
  id: string;
  name: string;
  resourceCost: number;
  description: string;
  attackBonus?: number;
  defenseBonus?: number;
  productionBonus?: number;
}
export interface GameEvent {
  id: number;
  round: number;
  type: string;
  message: string;
  combat?: CombatResult;
}
export interface BotDecision {
  faction: FactionId;
  cardIds: string[];
  reactionId: string;
  score: number;
  reason: string;
  pursuedGoalIds: string[];
}
export interface FactionStats {
  captures: number;
  successfulDefenses: number;
  rolesRevealed: number;
  damageInflicted: number;
  hqCaptures: number;
}
export interface ReactionCooldown {
  cardId: string;
  untilRound: number;
}
export interface GameState {
  version: 3;
  seed: string;
  rngState: number;
  round: number;
  phase: Phase;
  playerFaction: FactionId;
  factions: Record<FactionId, Faction>;
  territories: Territory[];
  cards: CardDefinition[];
  program: ProgrammedAction[];
  botPrograms: ProgrammedAction[];
  revealedPrograms: ProgrammedAction[];
  resolutionQueue: ProgrammedAction[];
  currentActionIndex: number;
  resolutionOriginId: number | null;
  resolutionTargetId: number | null;
  resolutionTechnologyId: string | null;
  attackDraft: AttackDraft | null;
  setupLocked: boolean;
  reaction: Reaction | null;
  botReactions: Reaction[];
  reactionCooldowns: Record<FactionId, ReactionCooldown | null>;
  reserveDice: Record<FactionId, number>;
  factionStats: Record<FactionId, FactionStats>;
  events: GameEvent[];
  roundGoals: RoundGoal[];
  roundGoalDeck: RoundGoal[];
  roundGoalDiscard: RoundGoal[];
  technologies: Technology[];
  winner: FactionId | null;
  selectedTerritory: number | null;
}
export interface SavedGame {
  version: 3;
  savedAt: string;
  state: GameState;
}
export type GameCommand =
  | { type: 'START'; faction: FactionId; seed: string }
  | { type: 'SELECT_TERRITORY'; territoryId: number }
  | { type: 'SELECT_RESOLUTION_ORIGIN'; territoryId: number }
  | { type: 'SELECT_RESOLUTION_TARGET'; territoryId: number }
  | { type: 'SELECT_TECHNOLOGY'; technologyId: string }
  | { type: 'ASSIGN_ROLE'; territoryId: number; role: RoleId }
  | { type: 'REMOVE_ROLE'; territoryId: number }
  | { type: 'MOVE_ROLE'; sourceTerritoryId: number; targetTerritoryId: number }
  | { type: 'LOCK_SETUP' }
  | { type: 'TOGGLE_ATTACK_ORIGIN'; territoryId: number }
  | { type: 'SET_ATTACK_COMMITMENT'; territoryId: number; troops: number }
  | { type: 'CONFIRM_ATTACK_ORDER' }
  | { type: 'SKIP_ATTACK_ORDER' }
  | { type: 'ADD_CARD'; cardId: string }
  | { type: 'REMOVE_CARD'; cardId: string }
  | { type: 'SET_REACTION'; cardId: string }
  | { type: 'COMMIT_PROGRAM' }
  | { type: 'RESOLVE_NEXT_ACTION' }
  | { type: 'RESOLVE_ROUND' }
  | { type: 'ADVANCE_PHASE' }
  | { type: 'RESET' };
