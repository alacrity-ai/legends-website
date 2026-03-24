import type { ReactNode } from 'react';
import styles from './Card.module.css';

type CardProps = {
  children: ReactNode;
  className?: string;
};

export default function Card({ children, className }: CardProps) {
  return (
    <div className={`${styles.card}${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}

