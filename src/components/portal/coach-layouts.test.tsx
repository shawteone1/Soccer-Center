import { describe,it,expect } from 'vitest';
import {render,screen} from '@testing-library/react';
import {CoachProfileCard} from './CoachProfileCard';
import {coachCardStyle, styledCoachUrl,COACH_CARD_STYLES} from '@/lib/portal/coach-card-style';
describe('coach presentation choices',()=>{
 it.each(COACH_CARD_STYLES)('%s renders only the projected fields',style=>{
  render(<CoachProfileCard layout={style} profile={{label:'Jordan',upcomingEvents:[{id:'a',title:'ID camp',date:'2026-12-05',eventType:'camp',location:'Field 1',opponent:null,isHome:true,competition:''}]}}/>);
  expect(screen.getByTestId('coach-profile-card')).toHaveAttribute('data-layout',style);
  expect(screen.getByText('Jordan')).toBeInTheDocument();expect(screen.queryByText('School & academics')).not.toBeInTheDocument();
  expect(screen.getByText('camp')).toBeInTheDocument();expect(screen.queryByText('Home')).not.toBeInTheDocument();
 });
 it('keeps bearer token, existing query and hash when adding a style',()=>{
  const u=styledCoachUrl('https://soccercenter.org/coach/profile/test-token?x=1#card','trading');
  expect(new URL(u).pathname).toBe('/coach/profile/test-token');expect(new URL(u).searchParams.get('style')).toBe('trading');expect(new URL(u).searchParams.get('x')).toBe('1');expect(new URL(u).hash).toBe('#card');
  expect(styledCoachUrl('/coach/profile/test-token?style=trading','classic')).toBe('/coach/profile/test-token');
 });
 it('unknown styles fall back to Classic',()=>expect(coachCardStyle('anything')).toBe('classic'));
});
