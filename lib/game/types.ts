export type FactionId = 'synod' | 'compact' | 'host' | 'choir';
export type RoleId = 'hq' | 'industrial' | 'warehouse' | 'spy' | 'training' | 'fortress' | 'depot';
export type ActionType = 'attack' | 'march' | 'fortify' | 'repair' | 'recon' | 'sabotage' | 'develop' | 'faction';
export type Phase = 'setup' | 'production' | 'programming' | 'resolution' | 'ended';
export interface Faction { id:FactionId; name:string; color:string; glyph:string; startTerritories:number; production:number; defenseBonus:number; trainingBonus:number; special:string; vp:number; intel:number; eliminated:boolean; technologies:string[]; secretObjective:string; }
export interface Territory { id:number; name:string; region:number; x:number; y:number; adjacent:number[]; defense:1|2; owner:FactionId|null; troops:number; role:RoleId|null; roleRevealed:boolean; damage:number; fortified:number; }
export interface HiddenRole { id:RoleId; name:string; defenseBonus:number; description:string; }
export interface CardDefinition { id:string; faction:FactionId; name:string; action:ActionType; speed:number; band:'green'|'yellow'|'red'; power:number; sequence:string; reaction:string; }
export interface ProgrammedAction { faction:FactionId; cardId:string; speed:number; targetId?:number; originIds?:number[]; }
export interface Reaction { faction:FactionId; cardId:string; trigger:'attacked'|'loses-territory'|'always'; used:boolean; }
export interface CombatResult { attacker:FactionId; defender:FactionId|null; targetId:number; originIds:number[]; attackDice:number[]; defenseDice:number[]; attackerLosses:number; defenderLosses:number; damageAdded:number; captured:boolean; summary:string; }
export interface Objective { id:string; name:string; description:string; vp:number; kind:'public'|'secret'; }
export interface Technology { id:string; name:string; cost:number; description:string; attackBonus?:number; defenseBonus?:number; productionBonus?:number; }
export interface GameEvent { id:number; round:number; type:string; message:string; combat?:CombatResult; }
export interface BotDecision { faction:FactionId; cardIds:string[]; reactionId:string; score:number; reason:string; }
export interface GameState { version:1; seed:string; rngState:number; round:number; phase:Phase; playerFaction:FactionId; factions:Record<FactionId,Faction>; territories:Territory[]; cards:CardDefinition[]; program:ProgrammedAction[]; reaction:Reaction|null; events:GameEvent[]; publicObjectives:Objective[]; objectiveDeck:Objective[]; technologies:Technology[]; winner:FactionId|null; selectedTerritory:number|null; }
export interface SavedGame { version:1; savedAt:string; state:GameState; }
export type GameCommand = {type:'START'; faction:FactionId; seed:string}|{type:'SELECT_TERRITORY'; territoryId:number}|{type:'ADD_CARD'; cardId:string}|{type:'REMOVE_CARD'; cardId:string}|{type:'SET_REACTION'; cardId:string}|{type:'RESOLVE_ROUND'}|{type:'ADVANCE_PHASE'}|{type:'RESET'};
