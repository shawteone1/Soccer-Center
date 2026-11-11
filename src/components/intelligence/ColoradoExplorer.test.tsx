import {afterEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,within} from '@testing-library/react';
import ColoradoExplorer from './ColoradoExplorer';
afterEach(()=>{cleanup();localStorage.clear();vi.restoreAllMocks();});
it('supports three-profile comparison, filters and on-device persistence',()=>{
 render(<ColoradoExplorer/>);
 fireEvent.click(screen.getByRole('button',{name:'Compare Colorado Storm'}));fireEvent.click(screen.getByRole('button',{name:'Compare Colorado United'}));fireEvent.click(screen.getByRole('button',{name:'Compare Real Colorado'}));
 expect(screen.getByRole('button',{name:'Compare Pride Soccer Club'})).toBeDisabled();
 fireEvent.click(within(screen.getByRole('region',{name:'Comparison controls'})).getByRole('button',{name:'Save comparison'}));fireEvent.click(screen.getByRole('button',{name:'Clear'}));fireEvent.click(screen.getByRole('button',{name:'Load saved comparison'}));
 expect(screen.getByText('3/3 selected')).toBeInTheDocument();
 const compare=screen.getByRole('region',{name:'Side-by-side comparison'});expect(within(compare).getByRole('heading',{name:'Colorado Storm'})).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Search'),{target:{value:'not-a-club'}});expect(screen.getByText(/No profiles match/)).toBeInTheDocument();
});
it('handles unavailable device storage visibly',()=>{vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked');});render(<ColoradoExplorer/>);fireEvent.click(screen.getByRole('button',{name:'Compare Colorado Storm'}));fireEvent.click(within(screen.getByRole('region',{name:'Comparison controls'})).getByRole('button',{name:'Save comparison'}));expect(screen.getByRole('status')).toHaveTextContent('Device storage is unavailable');});
it('separates the college starter data and reviewed cost examples',()=>{render(<ColoradoExplorer/>);fireEvent.click(screen.getByRole('button',{name:'Colorado colleges'}));expect(screen.getByRole('heading',{name:'Colorado College'})).toBeInTheDocument();expect(screen.getByText(/20 profiles shown/)).toBeInTheDocument();});

it('makes club leadership visible and separates joined dates from role appointments',()=>{
 render(<ColoradoExplorer/>);
 expect(screen.getAllByText('Aaron Nagel').length).toBeGreaterThan(0);
 expect(screen.getByText('CRYSC tenure per biography')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Colorado colleges'}));
 expect(screen.getAllByText('Lewis Wilcox').length).toBeGreaterThan(0);
 expect(screen.getAllByText(/permanent role effective date/).length).toBeGreaterThan(0);
});

it('opens a shareable institution profile from its id',()=>{
 window.history.replaceState({},'', '?profile=uccs');
 render(<ColoradoExplorer/>);
 expect(screen.getByRole('heading',{level:1,name:'University of Colorado Colorado Springs'})).toBeInTheDocument();
 expect(screen.getByText(/School costs and academic facts are shared/)).toBeInTheDocument();
 expect(screen.getByRole('link',{name:'← Back to directory'})).toHaveAttribute('href','?');
 window.history.replaceState({},'', '/');
});

it('opens the college view from the public directory link',()=>{
 window.history.replaceState({},'', '?kind=college');render(<ColoradoExplorer/>);
 expect(screen.getByRole('button',{name:'Colorado colleges'})).toHaveAttribute('aria-pressed','true');
 expect(screen.getByText(/20 profiles shown/)).toBeInTheDocument();window.history.replaceState({},'', '/');
});
it('does not load public club selections into the portal college comparison',()=>{
 localStorage.setItem('sc_public_comparison_v1',JSON.stringify(['storm']));
 render(<ColoradoExplorer embedded collegeOnly/>);fireEvent.click(screen.getByRole('button',{name:'Load saved comparison'}));
 expect(screen.getByText('0/3 selected')).toBeInTheDocument();
});

it('makes both save controls reflect the saved selection and restores it after remount',()=>{
 const {unmount}=render(<ColoradoExplorer collegeOnly embedded/>);
 const controls=()=>within(screen.getByRole('region',{name:'Comparison controls'}));
 expect(controls().getByRole('button',{name:'Save comparison'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Compare Colorado College'}));
 const comparison=within(screen.getByRole('region',{name:'Side-by-side comparison'}));
 fireEvent.click(comparison.getByRole('button',{name:'Save comparison'}));
 expect(controls().getByRole('button',{name:'Saved'})).toBeInTheDocument();
 expect(comparison.getByRole('button',{name:'Saved'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Compare University of Denver'}));
 expect(controls().getByRole('button',{name:'Save comparison'})).toBeEnabled();
 unmount();render(<ColoradoExplorer collegeOnly embedded/>);
 fireEvent.click(screen.getByRole('button',{name:'Load saved comparison'}));
 expect(screen.getByText('1/3 selected')).toBeInTheDocument();
 expect(controls().getByRole('button',{name:'Saved'})).toBeInTheDocument();
});
