import type { ReactNode } from 'react';
import styles from './Section.module.css';

type SectionProps = {
  id?: string;
  children: ReactNode;
  className?: string;
};

export default function Section({ id, children, className }: SectionProps) {
  return (
    <section
      id={id}
      className={`${styles.section}${className ? ` ${className}` : ''}`}
    >
      {children}
    </section>
  );
}

