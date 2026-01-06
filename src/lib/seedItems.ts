// src/lib/seedItems.ts
import { db } from './firebase';
import { doc, setDoc } from 'firebase/firestore';
import { GameItem } from '@/types/game';

export const seedInitialItems = async () => {
  const items: GameItem[] = [
    {
      id: 'sword-wood',
      name: 'Espada de Madera',
      description: 'Una espada básica para aprendices.',
      type: 'weapon',
      slot: 'mainHand',
      price: 50,
      stats: { d: 2 }
    },
    {
      id: 'potion-small',
      name: 'Poción Pequeña',
      description: 'Restaura 10 HP.',
      type: 'potion',
      price: 15,
      stats: { heal: { flat: 10 } }
    },
  ];

  try {
    for (const item of items) {
      // Usamos setDoc para forzar el ID que nosotros queremos (ej: 'sword-wood')
      await setDoc(doc(db, 'items', item.id), item);
      console.log(`Item creado: ${item.name}`);
    }
    alert('Items iniciales creados en la base de datos!');
  } catch (error) {
    console.error('Error creando items:', error);
    alert('Hubo un error, revisa la consola.');
  }
};