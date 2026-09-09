#!/usr/bin/env python3
"""Dependency-free Monte Carlo simulator for Nox Certamen combat v0.1."""
import argparse, random
from collections import Counter

def battle(rng, attackers, defenders, defense, attack_bonus, defense_bonus, damage):
    attack_pool=min(8,attackers+attack_bonus)
    troop_dice=min(8,defenders)
    raw_bonus=defenders*(defense-1)+defense_bonus
    active_bonus=max(0,min(8-troop_dice,raw_bonus)-damage)
    a=sorted((rng.randint(1,6) for _ in range(attack_pool)),reverse=True)
    d=sorted((rng.randint(1,6) for _ in range(troop_dice+active_bonus)),reverse=True)
    al=dl=marks=0; bonus=active_bonus
    for av,dv in zip(a,d):
        if av>dv and dl<defenders: dl+=1
        elif av<dv and al<attackers: al+=1
        elif bonus: bonus-=1; marks+=1
        elif al<attackers: al+=1
    return dl>=defenders and al<attackers,al,dl,marks

def main():
    p=argparse.ArgumentParser();p.add_argument('--attackers',type=int,required=True);p.add_argument('--defenders',type=int,required=True);p.add_argument('--defense',type=int,choices=(1,2),default=1);p.add_argument('--attack-bonus',type=int,default=0);p.add_argument('--defense-bonus',type=int,default=0);p.add_argument('--damage',type=int,default=0);p.add_argument('--trials',type=int,default=10000);p.add_argument('--seed',default='NOX-1703');a=p.parse_args()
    rng=random.Random(a.seed);results=[battle(rng,a.attackers,a.defenders,a.defense,a.attack_bonus,a.defense_bonus,a.damage) for _ in range(a.trials)];captures=sum(x[0] for x in results)
    print(f'Capture probability: {captures/a.trials:.1%}')
    print(f'Average attacker losses: {sum(x[1] for x in results)/a.trials:.2f}')
    print(f'Average defender losses: {sum(x[2] for x in results)/a.trials:.2f}')
    print(f'Average defense damage: {sum(x[3] for x in results)/a.trials:.2f}')
    print('Damage distribution:',dict(sorted(Counter(x[3] for x in results).items())))
if __name__=='__main__': main()
