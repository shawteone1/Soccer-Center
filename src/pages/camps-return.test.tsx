import {HelmetProvider} from '@dr.pogodin/react-helmet';
import {it,expect,vi} from 'vitest';import {render,screen} from '@testing-library/react';import {MemoryRouter} from 'react-router';import CampsPage from './camps';
vi.mock('@/components/PublicCampDirectory',()=>({default:()=> <div>Directory</div>}));
it('offers a fixed parent return route for parent arrivals',()=>{render(<HelmetProvider><MemoryRouter initialEntries={['/camps?from=parent']}><CampsPage/></MemoryRouter></HelmetProvider>);expect(screen.getByRole('link',{name:/Back to Parent Portal/})).toHaveAttribute('href','/parent-portal');});
it('keeps the public entry free of a parent-only return button',()=>{render(<HelmetProvider><MemoryRouter initialEntries={['/camps']}><CampsPage/></MemoryRouter></HelmetProvider>);expect(screen.queryByRole('link',{name:/Back to Parent Portal/})).not.toBeInTheDocument();});
