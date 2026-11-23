import { useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import './Collapsible.css';

// A section whose heading opens and closes it. The heading holds a real
// button (not a <details> summary, which screen readers announce as a button
// and drop the heading from), so heading navigation still finds it.
// Closed at first. The contents mount on the first open, so anything they
// load waits until then, and stay mounted after, so reopening is instant.
function Collapsible({ title, className = '', children }) {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const id = useId();
  const toggle = () => {
    setOpen(!open);
    setOpened(true);
  };

  return (
    <section className={`collapsible ${className}`}>
      <h3>
        <button type="button" className="collapsible__toggle" aria-expanded={open} aria-controls={id} onClick={toggle}>
          <ChevronRight size={18} aria-hidden="true" className="collapsible__icon" />
          {title}
        </button>
      </h3>
      <div id={id} className="collapsible__content" hidden={!open}>
        {opened && children}
      </div>
    </section>
  );
}

export default Collapsible;
