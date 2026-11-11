import {afterEach,expect,it} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import ProfileLogo from './ProfileLogo';
afterEach(cleanup);
it('keeps unknown identities text-only rather than substituting a crest',()=>{render(<ProfileLogo id="unknown" name="New Club"/>);expect(screen.queryByRole('img')).toBeNull();expect(screen.getByLabelText('New Club: logo unavailable')).toHaveTextContent('NC');});
it('replaces failed local artwork with a readable fallback',()=>{render(<ProfileLogo id="storm" name="Colorado Storm"/>);const image=screen.getByRole('img',{name:'Colorado Storm logo'});fireEvent.error(image);expect(screen.queryByRole('img')).toBeNull();expect(screen.getByLabelText('Colorado Storm: logo unavailable')).toBeInTheDocument();});
