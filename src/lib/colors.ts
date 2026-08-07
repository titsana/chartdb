export const colorOptions = [
    '#ff6363', // A brighter red.
    '#ff6b8a', // A vibrant pink.
    '#f5589e', // A hot magenta.
    '#c05dcf', // A rich purple.
    '#b067e9', // A lighter purple.
    '#8a61f5', // A bold indigo.
    '#7175fa', // A lighter indigo.
    '#5c8dfa', // A rich blue.
    '#8eb7ff', // A sky blue.
    '#5fd0f3', // A bright cyan.
    '#42e0c0', // A fresh aqua.
    '#3ddb91', // A jade green.
    '#4dee8a', // A mint green.
    '#9ef07a', // A lime green.
    '#c3e35c', // A chartreuse.
    '#ffe374', // A warm yellow.
    '#ffcb52', // A golden yellow.
    '#ff9f74', // A peachy orange.
    '#ff8352', // A burnt orange.
    '#c98a5c', // A muted brown.
    '#a3a3a3', // A neutral gray.
    '#7d95b3', // A slate blue.
    '#5cd6d6', // A teal.
    '#e082e0', // A soft orchid.
];

export const randomColor = () => {
    return colorOptions[Math.floor(Math.random() * colorOptions.length)];
};

export const viewColor = '#b0b0b0';
export const materializedViewColor = '#7d7d7d';
export const defaultTableColor = '#8eb7ff';
export const defaultAreaColor = '#b067e9';
