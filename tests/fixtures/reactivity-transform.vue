<script setup>
import { ref } from 'vue'

const ref1 = $ref('hello')
const ref2 = $(ref('hello'))

console.log(ref1)
console.log(ref2)
console.log($$(ref1))
console.log($$(ref2))
</script>
