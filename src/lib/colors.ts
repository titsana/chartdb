export const colorOptions = [
    '#ff6363', // A brighter red.
    '#ff6b8a', // A vibrant pink.
    '#c05dcf', // A rich purple.
    '#b067e9', // A lighter purple.
    '#8a61f5', // A bold indigo.
    '#7175fa', // A lighter indigo.
    '#8eb7ff', // A sky blue.
    '#42e0c0', // A fresh aqua.
    '#4dee8a', // A mint green.
    '#9ef07a', // A lime green.
    '#ffe374', // A warm yellow.
    '#ff9f74', // A peachy orange.
    '#5da9ff', // A medium blue.
    '#36cfc9', // A teal.
    '#7bd389', // A sage green.
    '#c9a227', // A mustard gold.
    '#a0785a', // A warm brown.
    '#94a3b8', // A slate gray.
    '#e857b0', // A magenta.
    '#f2545b', // A coral red.
];

export const randomColor = () => {
    return colorOptions[Math.floor(Math.random() * colorOptions.length)];
};

export const viewColor = '#b0b0b0';
export const materializedViewColor = '#7d7d7d';
export const defaultTableColor = '#8eb7ff';
export const defaultAreaColor = '#b067e9';
