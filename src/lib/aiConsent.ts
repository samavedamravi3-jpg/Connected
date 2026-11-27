/** Whether the user allowed AI suggestions that send chat or profile text to an AI provider. Off until they turn it on. */
let allowed = false;
export const setAiAllowed = (v: boolean) => {
  allowed = v;
};
export const aiAllowed = () => allowed;
