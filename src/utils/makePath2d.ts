export const makePath2d = (path: string) => new Path2D(path);

export const makePath2dFromArray = (pathArray: string[]): Path2D[] => {
  const path2d = [] as Path2D[];
  pathArray.forEach(p => path2d.push(new Path2D(p)));
  return path2d;
};
