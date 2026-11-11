import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import UkEducationEditor from './UkEducationEditor';
import { emptyUkEducation } from '../../lib/portal/uk-education';

function Harness() { const [value, setValue] = useState(emptyUkEducation()); return <UkEducationEditor value={value} onChange={setValue}/>; }
describe('UK editor', () => {
  it('adds and removes an exam without a GPA or legacy qualification', () => {
    render(<Harness/>);
    fireEvent.click(screen.getByRole('button', { name: 'Add exam' }));
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Biology' } });
    expect(screen.getByLabelText('Subject')).toHaveValue('Biology');
    expect(screen.queryByRole('option', { name: 'GNVQ' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove exam 1' }));
    expect(screen.queryByLabelText('Subject')).toBeNull();
  });
});
